# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""A minimal client for any OpenAI-compatible chat API.

Groq and OpenAI both speak `POST {base_url}/chat/completions`, so moving from
one to the other is a change of base URL, model and key in FCRM Settings.
"""

import json
import re

import frappe
import requests

DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "openai/gpt-oss-120b"
DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo"
# Groq's limit for an uploaded file on the free tier.
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class AIUnavailable(Exception):
	"""The model could not be asked or gave no usable answer. Callers keep the
	work pending so it is tried again later; nothing is lost."""


def api_key() -> str | None:
	settings = frappe.get_cached_doc("FCRM Settings")
	key = settings.get_password("ai_api_key", raise_exception=False) if settings.ai_api_key else None
	return key or frappe.conf.get("groq_api_key")


def model_name() -> str:
	return (frappe.get_cached_doc("FCRM Settings").ai_model or DEFAULT_MODEL).strip()


def _connection() -> tuple[str, str]:
	key = api_key()
	if not key:
		raise AIUnavailable("No API key is set.")
	settings = frappe.get_cached_doc("FCRM Settings")
	return (settings.ai_base_url or DEFAULT_BASE_URL).strip().rstrip("/"), key


def chat_json(system: str, user: str, timeout: int = 30) -> dict:
	"""Ask the model and return its answer parsed as a JSON object."""
	base_url, key = _connection()
	model = model_name()

	body = {
		"model": model,
		"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
		"temperature": 0,
		"response_format": {"type": "json_object"},
	}
	# gpt-oss models think before answering; a classification doesn't need much.
	if "gpt-oss" in model:
		body["reasoning_effort"] = "low"

	try:
		response = requests.post(
			f"{base_url}/chat/completions",
			json=body,
			headers={"Authorization": f"Bearer {key}"},
			timeout=timeout,
		)
	except requests.RequestException as e:
		raise AIUnavailable(f"Could not reach the AI service: {e}") from e

	if response.status_code != 200:
		raise AIUnavailable(f"AI service answered {response.status_code}: {response.text[:300]}")

	try:
		content = response.json()["choices"][0]["message"]["content"] or ""
	except (ValueError, KeyError, IndexError) as e:
		raise AIUnavailable("AI service returned an unexpected response.") from e
	return parse_json(content)


def parse_json(content: str) -> dict:
	"""The JSON object in a model answer, tolerating a code fence around it."""
	try:
		data = json.loads(content)
	except ValueError:
		match = re.search(r"\{.*\}", content, re.S)
		if not match:
			raise AIUnavailable("AI answer was not JSON.") from None
		try:
			data = json.loads(match.group(0))
		except ValueError:
			raise AIUnavailable("AI answer was not JSON.") from None
	if not isinstance(data, dict):
		raise AIUnavailable("AI answer was not a JSON object.")
	return data


def transcribe_audio(content: bytes, filename: str, timeout: int = 120) -> str:
	"""Speech to text with the transcription model (Whisper on Groq or OpenAI)."""
	if len(content) > MAX_AUDIO_BYTES:
		raise AIUnavailable("The recording is larger than 25 MB, too big to transcribe.")
	base_url, key = _connection()
	model = (frappe.get_cached_doc("FCRM Settings").ai_transcription_model or DEFAULT_TRANSCRIPTION_MODEL).strip()
	try:
		response = requests.post(
			f"{base_url}/audio/transcriptions",
			headers={"Authorization": f"Bearer {key}"},
			data={"model": model, "response_format": "json", "temperature": "0"},
			files={"file": (filename, content)},
			timeout=timeout,
		)
	except requests.RequestException as e:
		raise AIUnavailable(f"Could not reach the AI service: {e}") from e
	if response.status_code != 200:
		raise AIUnavailable(f"AI service answered {response.status_code}: {response.text[:300]}")
	try:
		return (response.json().get("text") or "").strip()
	except ValueError as e:
		raise AIUnavailable("AI service returned an unexpected response.") from e
