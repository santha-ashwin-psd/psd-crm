<template>
  <!-- The height is set from JS once the message has been measured, so a
       transition on it animates the open: the frame starts at h-10 and grows
       to the message's own height. This used to happen by accident — the
       measurement loop stepped the height up frame by frame — and the easing
       was the one good thing about that bug, so it is kept deliberately here
       and honours prefers-reduced-motion.

       700ms on an easeOutQuint rather than the shared --crm-ease: that token
       is tuned for 150ms state changes (hover, focus) where a near-linear
       curve reads as instant feedback. This is a panel opening, not a state
       flip — it wants a long, decelerating settle, and the quint spends most
       of its time slowing down. -->
  <iframe
    ref="iframeRef"
    :srcdoc="htmlContent"
    class="prose-f block h-10 max-h-[500px] w-full transition-[height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
  />
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  content: { type: String, required: true },
})

// The email frame reuses the stylesheets this page already loaded, by
// reference. It used to embed the whole app stylesheet (~5 MB) in the bundle
// and paste it into every email's frame, so each email made the browser parse
// it again: the main reason a pipeline with emails was slow to open.
function appStyles() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map((link) => `<link rel="stylesheet" href="${link.href}">`)
    .join('')
  if (links) return links
  // Vite dev server: styles are injected as <style> tags instead.
  return [...document.querySelectorAll('style')]
    .map((style) => `<style>${style.textContent}</style>`)
    .join('')
}

const iframeRef = ref(null)
const _content = ref(props.content)

const parser = new DOMParser()
const doc = parser.parseFromString(_content.value, 'text/html')

const gmailReplyToContent = doc.querySelectorAll('div.gmail_quote')
const outlookReplyToContent = doc.querySelectorAll('div#appendonsend')
const replyToContent = doc.querySelectorAll('p.reply-to-content')

if (gmailReplyToContent.length) {
  _content.value = parseReplyToContent(doc, 'div.gmail_quote', true)
} else if (outlookReplyToContent.length) {
  _content.value = parseReplyToContent(doc, 'div#appendonsend')
} else if (replyToContent.length) {
  _content.value = parseReplyToContent(doc, 'p.reply-to-content')
}

function parseReplyToContent(doc, selector, forGmail = false) {
  function handleAllInstances(doc) {
    let elements = doc.querySelectorAll(selector)
    while (elements.length) {
      const remaining = elements.length
      replaceReplyToContent(elements[0], forGmail)
      elements = doc.querySelectorAll(selector)
      // `replaceReplyToContent` returns early — without replacing anything —
      // when the marker has no following siblings to collapse. This used to
      // recurse unconditionally, so such a marker was found again on every
      // pass: infinite recursion, and a stack overflow while the component was
      // still setting up, taking the whole email area down with it.
      if (elements.length >= remaining) break
    }
  }

  handleAllInstances(doc)

  return doc.body.innerHTML
}

function replaceReplyToContent(replyToContentElement, forGmail) {
  if (!replyToContentElement) return
  let randomId = Math.random().toString(36).substring(2, 7)
  const wrapper = doc.createElement('div')
  wrapper.classList.add('replied-content')

  const collapseLabel = doc.createElement('label')
  collapseLabel.classList.add('collapse')
  collapseLabel.setAttribute('for', randomId)
  collapseLabel.innerHTML = '...'
  wrapper.appendChild(collapseLabel)

  const collapseInput = doc.createElement('input')
  collapseInput.setAttribute('id', randomId)
  collapseInput.setAttribute('class', 'replyCollapser')
  collapseInput.setAttribute('type', 'checkbox')
  wrapper.appendChild(collapseInput)

  if (forGmail) {
    const prevSibling = replyToContentElement.previousElementSibling
    if (prevSibling && prevSibling.tagName === 'BR') {
      prevSibling.remove()
    }
    let cloned = replyToContentElement.cloneNode(true)
    cloned.classList.remove('gmail_quote')
    wrapper.appendChild(cloned)
  } else {
    const allSiblings = Array.from(replyToContentElement.parentElement.children)
    const replyToContentIndex = allSiblings.indexOf(replyToContentElement)
    const followingSiblings = allSiblings.slice(replyToContentIndex + 1)

    if (followingSiblings.length === 0) return

    let clonedFollowingSiblings = followingSiblings.map((sibling) =>
      sibling.cloneNode(true),
    )

    const div = doc.createElement('div')
    div.append(...clonedFollowingSiblings)

    wrapper.append(div)

    // Remove all siblings after the reply-to-content element
    for (let i = replyToContentIndex + 1; i < allSiblings.length; i++) {
      replyToContentElement.parentElement.removeChild(allSiblings[i])
    }
  }

  replyToContentElement.parentElement.replaceChild(
    wrapper,
    replyToContentElement,
  )
}

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  ${appStyles()}
  <style>
    /* index.css paints body with --crm-bg (the page canvas). Inside this iframe
       the email must sit on the surrounding card surface, not a gray band.

       The height reset is the important one. index.css is injected whole, and
       it sets html and body to 100% height for the app shell — so inside the
       iframe the body was always exactly as tall as the iframe itself.
       setHeight() then measured the viewport instead of the email, grew the
       iframe, which grew the body, which fired the ResizeObserver again: every
       message ratcheted up to the 500px cap no matter how short it was. Let
       the document size to its content and the measurement becomes honest. */
    html, body {
      background: transparent !important;
      margin: 0;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
    :root {
      --bg-surface-gray-3: #ededed;
      --bg-surface-gray-4: #e2e2e2;
    }
    [data-theme='dark'] {
      --bg-surface-gray-3: #343434;
      --bg-surface-gray-4: #424242;
    }

    .replied-content .collapse {
      margin: 10px 0 10px 0;
      visibility: visible;
      cursor: pointer;
      display: flex;
      font-size: larger;
      font-weight: 700;
      height: 12px;
      line-height: 0.1;
      background: var(--bg-surface-gray-3);
      width: 23px;
      justify-content: center;
      border-radius: var(--crm-radius-sm);
    }

    .replied-content .collapse:hover {
      background: var(--bg-surface-gray-4);
    }

    .replied-content .collapse + input {
      display: none;
    }
    .replied-content .collapse + input + div {
      display: none;
    }
    .replied-content .collapse + input:checked + div {
      display: block;
    }

    .email-content {
        word-break: break-word;
    }
    .email-content
        :is(:where(table):not(:where([class~='not-prose'], [class~='not-prose']
            *))) {
    table-layout: auto;
    }

    .email-content
        :where(table):not(:where([class~='not-prose'], [class~='not-prose'] *)) {
    width: unset;
    table-layout: auto;
    text-align: unset;
    margin-top: unset;
    margin-bottom: unset;
    font-size: unset;
    line-height: unset;
    }

    /* tr */

    .email-content
        :where(tbody tr):not(:where([class~='not-prose'], [class~='not-prose']
            *)) {
    border-bottom-width: 0;
    border-bottom-color: transparent;
    }

    /* td */

    .email-content
        :is(:where(td):not(:where([class~='not-prose'], [class~='not-prose'] *))) {
    position: unset;
    border-width: 0;
    border-color: transparent;
    padding: 0;
    }

    .email-content
        :where(tbody td):not(:where([class~='not-prose'], [class~='not-prose']
            *)) {
    vertical-align: revert;
    }

    /* image */
    .email-content
        :is(:where(img):not(:where([class~='not-prose'], [class~='not-prose']
            *))) {
    border-width: 0;
    }

    .email-content
        :where(img):not(:where([class~='not-prose'], [class~='not-prose'] *)) {
    margin: 0;
    }

    /* before & after */

    .email-content
        :where(blockquote
        p:first-of-type):not(:where([class~='not-prose'], [class~='not-prose']
            *))::before {
    content: none;
    }

    .email-content
        :where(blockquote
        p:last-of-type):not(:where([class~='not-prose'], [class~='not-prose']
            *))::after {
    content: none;
    }
  </style>
</head>
<body>
    <div ref="emailContentRef" class="email-content prose-f">${_content.value}</div>
</body>
</html>
`

watch(iframeRef, (iframe) => {
  if (!iframe) return
  iframe.onload = () => {
    const cw = iframe.contentWindow
    const cdoc = cw.document
    const emailContent = cdoc.querySelector('.email-content')
    if (!emailContent) return
    const parent = emailContent.closest('html')

    const theme = document.documentElement.getAttribute('data-theme')
    parent.setAttribute('data-theme', theme)

    // documentElement.scrollHeight is the honest number — but only because the
    // style block above stops html/body being pinned to 100% of the iframe.
    // While they were, this measured the iframe's own height, which is a
    // self-reference: the iframe cannot size to something sized to the iframe.
    //
    // It is also the only candidate that accounts for the message's outer
    // margins. The content wrapper's own scrollHeight excludes them (a child
    // paragraph's 8px margins collapse through it), which left the last line
    // clipped by the margin's worth.
    //
    // parent.offsetHeight is deliberately NOT in this max: it is the html
    // element, i.e. the iframe's height again.
    //
    // The cap lives on the iframe's class (max-h-[500px]): a short message
    // stops where it stops, a long one stops at the cap and scrolls inside.
    const setHeight = () => {
      const h = Math.max(
        cdoc.documentElement?.scrollHeight || 0,
        cdoc.body?.scrollHeight || 0,
      )
      if (h) iframe.style.height = h + 1 + 'px'
    }
    setHeight()

    // Images load AFTER the iframe's own onload, so the first measure is too
    // short and clips tall images — remeasure as each one finishes.
    cdoc.querySelectorAll('img').forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', setHeight)
        img.addEventListener('error', setHeight)
      }
    })

    // Any later reflow (web fonts, collapsers, quoted-reply expand) → remeasure.
    if (cw.ResizeObserver && cdoc.body) {
      new cw.ResizeObserver(() => setHeight()).observe(cdoc.body)
    }

    emailContent.querySelectorAll('.replyCollapser').forEach((rc) => {
      rc.addEventListener('change', setHeight)
    })
  }
})
</script>
