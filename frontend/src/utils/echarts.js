// A slim ECharts for frappe-ui's charts: `import { init } from 'echarts'` is
// aliased here (vite.config.js) so only the chart types and features the CRM
// draws are bundled, not the whole library (~3 MB of source, every chart type
// and map). Add to `use([...])` before drawing a new kind of chart.
import { use } from 'echarts/core'
import { BarChart, FunnelChart, LineChart, PieChart } from 'echarts/charts'
import {
  AxisPointerComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer, CanvasRenderer } from 'echarts/renderers'

use([
  BarChart,
  LineChart,
  PieChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  MarkLineComponent,
  SVGRenderer,
  CanvasRenderer,
])

export * from 'echarts/core'
