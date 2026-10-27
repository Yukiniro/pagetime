import React,{useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import * as echarts from 'echarts/core';
import {BarChart,CustomChart,HeatmapChart} from 'echarts/charts';
import {GridComponent,TooltipComponent,VisualMapComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {addDays, midnight} from './model.mjs';
import {spansOnDay, timelineDomainAt} from './timeline-select.mjs';
import {trendDayAt, trendUnrecorded} from './trend-select.mjs';
import {weekHourMatrix,weekStartOf} from './heatmap.mjs';
import {duration,formatDate,timeLabel} from './i18n.js';
import {getChartTheme,timelineSwatchesFor} from './theme.mjs';
echarts.use([BarChart,CustomChart,HeatmapChart,GridComponent,TooltipComponent,VisualMapComponent,CanvasRenderer]);
function Chart({option,label,className,height,onClick}){
  const ref=useRef(null);
  useEffect(()=>{
    const el=ref.current;
    const chart=echarts.init(el,null,{renderer:'canvas'});
    chart.setOption(option);
    const handleClick=params=>{
      if(params?.componentType!=='series')return;
      onClick?.(params,el);
    };
    if(onClick)chart.on('click',handleClick);
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(el);
    return()=>{observer.disconnect();chart.dispose();};
  },[option,onClick]);
  return <div ref={ref} role="img" aria-label={label} className={className} style={height?{height}:undefined} tabIndex={onClick?-1:undefined}/>;
}
const DIMMED_BAR_ALPHA=0.4;
function withAlpha(hex,alpha){
  const value=parseInt(hex.slice(1),16);
  return `rgba(${value>>16&255},${value>>8&255},${value&255},${alpha})`;
}
function chartTheme(isDark){
  const theme=getChartTheme(isDark);
  const fontFamily=getComputedStyle(document.documentElement).fontFamily;
  const tooltip=extra=>({backgroundColor:theme.tooltipBg,borderColor:theme.tooltipBorder,borderWidth:1,textStyle:{color:theme.tooltipText,fontFamily},...extra});
  return {theme,fontFamily,tooltip};
}
export function Trend({days, label, className='trend-chart', variant='overview', isDark=false, onSelectDay}){
  const {t}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const detail=variant==='detail';
  const onClick=onSelectDay?(params)=>{
    const at=trendDayAt(days,params?.dataIndex);
    if(at===null)return;
    onSelectDay(at);
  }:undefined;
  const bars={type:'bar',barMaxWidth:46,itemStyle:{color:theme.bar,borderRadius:[2,2,0,0]},data:days.map(d=>trendUnrecorded(d)?null:d.ms/3_600_000)};
  // A recorded zero is a one-pixel bar so it can be clicked. An unrecorded day stays null.
  if(onSelectDay){bars.barMinHeight=1;bars.cursor='pointer';}
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:detail?{left:8,right:8,top:8,bottom:4,containLabel:true}:{left:56,right:10,top:12,bottom:52},
    tooltip:tooltip({trigger:'axis',renderMode:'richText',formatter:p=>{const day=days[p[0]?.dataIndex];if(!day)return '';return `${formatDate(day.at)}\n${trendUnrecorded(day)?t('detail.trend.unrecorded'):t('active',{duration:duration((p[0].value??0)*3_600_000)})}`;}}),
    xAxis:{type:'category',data:days.map(d=>d.at),axisTick:{show:false},axisLine:{lineStyle:{color:theme.axis}},axisLabel:{color:theme.label,fontSize:detail?11:12,...(detail?{hideOverlap:true}:{}),interval:days.length>14?4:0,formatter:at=>`${formatDate(Number(at),{month:'numeric',day:'2-digit'})}\n${midnight(Number(at))===midnight(Date.now())?t('range.today'):formatDate(Number(at),{weekday:'short'})}`}},
    yAxis:{type:'value',min:0,minInterval:1,max:Math.max(6,...days.map(d=>Math.ceil(d.ms/3_600_000))),splitNumber:3,axisLabel:{color:theme.label,...(detail?{fontSize:11}:{}),formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:theme.split}}},
    series:[bars]};
  const summary=days.map(d=>`${formatDate(d.at)} ${trendUnrecorded(d)?t('detail.trend.unrecorded'):duration(d.ms)}`).join(t('trend.separator'));
  const dayLabel=day=>t('detail.trend.item',{date:formatDate(day.at),duration:duration(day.ms)});
  const body=<><Chart option={option} className={className} label={label??t('trend.label',{days:summary})} onClick={onClick}/>
    {onSelectDay&&<ul className="timeline-segments">{days.map((day,i)=>{
      const at=trendDayAt(days,i);
      if(at===null)return null;
      return <li key={day.at}><button type="button" className="sr-only timeline-segment pointer-events-none" onClick={()=>onSelectDay(at)}>{dayLabel(day)}</button></li>;
    })}</ul>}</>;
  // The sheet is position:fixed. The focused day button is position:absolute; top:0.
  // This frame keeps that label on the trend, inside the drawer scrollport.
  return detail?<div className="detail-trend-frame">{body}</div>:body;
}
export function SiteTrend({days, domain, isDark=false, onSelectDay}){
  const {t}=useTranslation();
  const item=day=>t('detail.trend.item',{date:formatDate(day.at),duration:trendUnrecorded(day)?t('detail.trend.unrecorded'):duration(day.ms)});
  return <><Trend days={days} variant="detail" className="detail-trend" isDark={isDark} onSelectDay={onSelectDay} label={t('detail.trend.label',{domain,days:days.map(item).join(t('detail.trend.separator'))})}/><ul className="sr-only">{days.map(day=><li key={day.at}>{item(day)}</li>)}</ul></>;
}
function hourColumnHits(count, ceiling){
  // One rect per category, from the baseline to the axis top, so a zero-ms hour is the whole column.
  return {type:'custom',coordinateSystem:'cartesian2d',data:Array.from({length:count},()=>0),tooltip:{show:false},emphasis:{disabled:true},z:10,renderItem(params,api){
    const base=api.coord([params.dataIndex,0]);
    const top=api.coord([params.dataIndex,ceiling]);
    const band=api.size([1,0])[0];
    const y=Math.min(base[1],top[1]);
    const height=Math.abs(base[1]-top[1]);
    if(!(band>0)||!(height>0))return;
    return {type:'rect',cursor:'pointer',shape:{x:base[0]-band/2,y,width:band,height},style:{fill:'rgba(0,0,0,0)'}};
  }};
}
export function HourChart({hours, dayCount, domain, isDark=false, onSelectHour, selectedHour=null}){
  const {t}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const average=ms=>duration(dayCount?ms/dayCount:0);
  const slot=hour=>{const from=new Date(2000,0,1,hour,0,0,0);return t('detail.hours.slot',{from:timeLabel(from),to:timeLabel(from.getTime()+3_600_000)});};
  const item=row=>t('detail.hours.item',{hour:slot(row.hour),duration:duration(row.ms),average:t('detail.hours.average',{duration:average(row.ms)})});
  const onClick=onSelectHour?(params)=>{
    const row=hours[params?.dataIndex];
    if(!row||!Number.isInteger(row.hour))return;
    onSelectHour(row.hour);
  }:undefined;
  const ceiling=Math.max(1,...hours.map(row=>Math.ceil(row.ms/3_600_000)));
  const selectedIndex=selectedHour===null?-1:hours.findIndex(row=>row.hour===selectedHour);
  const barColor=selectedIndex<0?theme.bar:params=>params.dataIndex===selectedIndex?theme.emphasis:withAlpha(theme.bar,DIMMED_BAR_ALPHA);
  const bars={type:'bar',barMaxWidth:14,itemStyle:{color:barColor,borderRadius:[2,2,0,0]},data:hours.map(row=>row.ms/3_600_000),z:2};
  if(onSelectHour)bars.cursor='pointer';
  const rowAt=params=>{const list=Array.isArray(params)?params:[];return hours[list.find(point=>point?.seriesType==='bar')?.dataIndex??list[0]?.dataIndex];};
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:{left:4,right:8,top:8,bottom:4,containLabel:true},
    tooltip:tooltip({trigger:'axis',renderMode:'richText',formatter:p=>{const row=rowAt(p);if(!row)return '';return `${slot(row.hour)}\n${t('active',{duration:duration(row.ms)})}\n${t('detail.hours.average',{duration:average(row.ms)})}`;}}),
    xAxis:{type:'category',data:hours.map(row=>row.hour),axisTick:{show:false},axisLine:{lineStyle:{color:theme.axis}},axisLabel:{color:theme.label,fontSize:11,interval:2,hideOverlap:true}},
    yAxis:{type:'value',min:0,minInterval:1,max:ceiling,splitNumber:2,axisLabel:{color:theme.label,fontSize:11,formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:theme.split}}},
    series:onSelectHour?[bars,hourColumnHits(hours.length,ceiling)]:[bars]};
  const chart=<Chart option={option} className="hour-chart" label={t('detail.hours.label',{domain,hours:hours.map(item).join(t('detail.hours.separator'))})} onClick={onClick}/>;
  const list=onSelectHour
    ?<ul className="timeline-segments">{hours.map(row=><li key={row.hour}><button type="button" className="sr-only timeline-segment pointer-events-none" onClick={()=>onSelectHour(row.hour)}>{item(row)}</button></li>)}</ul>
    :<ul className="sr-only">{hours.map(row=><li key={row.hour}>{item(row)}</li>)}</ul>;
  // The sheet is position:fixed. The focused hour button is position:absolute; top:0.
  // This frame keeps that label on the hour chart, inside the drawer scrollport.
  return onSelectHour?<div className="hour-chart-frame">{chart}{list}</div>:<>{chart}{list}</>;
}
export function DayHourChart({hours, isDark=false}){
  const {t}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const slot=hour=>{const from=new Date(2000,0,1,hour,0,0,0);return t('detail.hours.slot',{from:timeLabel(from),to:timeLabel(from.getTime()+3_600_000)});};
  const item=row=>`${slot(row.hour)} ${t('active',{duration:duration(row.ms)})}`;
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:{left:8,right:12,top:12,bottom:8,containLabel:true},
    tooltip:tooltip({trigger:'axis',renderMode:'richText',formatter:p=>{const row=hours[p[0]?.dataIndex];if(!row)return '';return `${slot(row.hour)}\n${t('active',{duration:duration(row.ms)})}`;}}),
    xAxis:{type:'category',data:hours.map(row=>row.hour),axisTick:{show:false},axisLine:{lineStyle:{color:theme.axis}},axisLabel:{color:theme.label,fontSize:12,interval:2,hideOverlap:true}},
    yAxis:{type:'value',min:0,minInterval:1,max:Math.max(1,...hours.map(row=>Math.ceil(row.ms/3_600_000))),splitNumber:3,axisLabel:{color:theme.label,formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:theme.split}}},
    series:[{type:'bar',barMaxWidth:18,itemStyle:{color:theme.bar,borderRadius:[2,2,0,0]},data:hours.map(row=>row.ms/3_600_000)}]};
  return <><Chart option={option} className="hour-chart primary-hours" label={hours.map(item).join(t('detail.hours.separator'))}/><ul className="sr-only">{hours.map(row=><li key={row.hour}>{item(row)}</li>)}</ul></>;
}
const weekdayAt=weekday=>new Date(2026,9,18+weekday).getTime();
const hourRange=hour=>[`${String(hour).padStart(2,'0')}:00`,hour===23?'24:00':`${String(hour+1).padStart(2,'0')}:00`];
export function Heatmap({rows,since,start,end,today,isDark=false,site=''}){
  const {t,i18n}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const matrix=weekHourMatrix(rows,start,end,since,weekStartOf(i18n.resolvedLanguage),today,site);
  const weekdayName=(weekday,width)=>formatDate(weekdayAt(weekday),{weekday:width});
  const item=cell=>{const [from,to]=hourRange(cell.hour);return t('heatmap.item',{weekday:weekdayName(cell.weekday,'long'),from,to,duration:duration(cell.average),days:t('heatmap.days',{count:cell.days})});};
  const top=matrix.cells.filter(cell=>cell.ms>0).sort((a,b)=>b.average-a.average||a.row-b.row||a.hour-b.hour).slice(0,3);
  const peak=matrix.cells.reduce((max,cell)=>Math.max(max,cell.average),0);
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:{left:4,right:8,top:8,bottom:18,containLabel:true},
    tooltip:tooltip({trigger:'item',renderMode:'richText',formatter:params=>item(matrix.cells[params.value[1]*24+params.value[0]])}),
    visualMap:{type:'continuous',min:0,max:peak||1,dimension:2,seriesIndex:0,show:false,inRange:{color:[theme.heatmapLow,theme.heatmapHigh]}},
    xAxis:{type:'category',data:Array.from({length:24},(_,hour)=>String(hour)),axisTick:{show:false},axisLine:{lineStyle:{color:theme.axis}},axisLabel:{color:theme.label,fontSize:11,interval:2},splitLine:{show:false}},
    yAxis:{type:'category',inverse:true,data:matrix.weekdays.map(weekday=>weekdayName(weekday,'short')),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:theme.labelMid,fontSize:12}},
    series:[{type:'heatmap',data:matrix.cells.map(cell=>[cell.hour,cell.row,cell.average]),itemStyle:{borderColor:theme.cell,borderWidth:3,borderRadius:3},emphasis:{itemStyle:{borderColor:theme.emphasis,borderWidth:2}}}]};
  return <><div className="heatmap-scroll"><Chart option={option} className="heatmap-chart" label={t('heatmap.label',{summary:top.length?top.map(item).join(t('heatmap.separator')):t('heatmap.empty')})}/></div>
    <p className="heatmap-legend"><i className="heatmap-scale" aria-hidden="true"/>{t('heatmap.legend',{min:duration(0),max:duration(peak)})}</p>
    <h3 className="sr-only">{t('heatmap.top')}</h3>
    <ul className="sr-only">{top.length?top.map(cell=><li key={`${cell.weekday}-${cell.hour}`}>{item(cell)}</li>):<li>{t('heatmap.empty')}</li>}</ul></>;
}
export function Timeline({spans, day, className='timeline-chart', lane=22, isDark=false, showEmpty=true, colorOf, onSelectSite, labelKey='timeline.label', emptyKey='timeline.empty', date=''}){
  const {t}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const other=timelineSwatchesFor(isDark).other;
  const fill=name=>colorOf?.(name)??other;
  const start=midnight(day);const end=addDays(start,1);
  const today=spansOnDay(spans, day);
  const onClick=onSelectSite?(params,currentTarget)=>{
    const domain=timelineDomainAt(today,params?.dataIndex);
    if(!domain)return;
    onSelectSite(domain,{currentTarget});
  }:undefined;
  const earliest=today.length?Math.min(...today.map(s=>s.start)):start+8*3_600_000;
  const latest=today.length?Math.max(...today.map(s=>s.end)):start+20*3_600_000;
  const min=Math.max(start,Math.min(start+8*3_600_000,Math.floor(earliest/3_600_000)*3_600_000));
  const max=Math.min(end,Math.max(start+20*3_600_000,Math.ceil(latest/3_600_000)*3_600_000));
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:{left:14,right:16,top:30,bottom:10,show:true,backgroundColor:theme.timeline,borderWidth:0},
    tooltip:tooltip({renderMode:'richText',formatter:p=>{const s=today[p.dataIndex];const name=s.site||s.domain;return `${name}\n${timeLabel(Math.max(s.start,start))}–${timeLabel(Math.min(s.end,end))}\n${duration(Math.min(s.end,end)-Math.max(s.start,start))}`;}}),
    xAxis:{type:'value',min,max,interval:((max-min)/3_600_000>16?4:2)*3_600_000,position:'top',axisLine:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{color:theme.label,fontSize:12,formatter:timeLabel}},
    yAxis:{show:false,min:0,max:1},
    series:[{type:'custom',data:today.map(s=>[Math.max(s.start,start),Math.min(s.end,end)]),renderItem:(params,api)=>{const from=api.coord([api.value(0),.5]),to=api.coord([api.value(1),.5]);const name=today[params.dataIndex].site||today[params.dataIndex].domain;return{type:'rect',shape:{x:from[0],y:from[1]-lane/2,width:Math.max(1,to[0]-from[0]),height:lane,r:4},style:{fill:fill(name)}};}}]};
  const item=(s,i)=>{
    const domain=timelineDomainAt(today,i);
    const label=t('timeline.item',{domain:domain||s.site||s.domain,from:timeLabel(s.start),to:timeLabel(s.end)});
    if(!onSelectSite||!domain)return <li key={i}>{onSelectSite?<span className="sr-only">{label}</span>:label}</li>;
    return <li key={i}><button type="button" className="sr-only timeline-segment pointer-events-none" onClick={event=>onSelectSite(domain,event)}>{label}</button></li>;
  };
  return <><Chart option={option} className={className} label={t(labelKey,{count:today.length,date})} onClick={onClick}/>{showEmpty&&!today.length&&<p className="timeline-empty">{t(emptyKey,{date})}</p>}<ul className={onSelectSite?'timeline-segments':'sr-only'}>{today.map(item)}</ul></>;
}
export function Breakdown({hosts, isDark=false}){
  const {t}=useTranslation();
  const {theme,fontFamily,tooltip}=chartTheme(isDark);
  const total=hosts.reduce((sum,host)=>sum+host.ms,0);
  const percent=host=>total?Math.round(host.ms*100/total):0;
  const share=host=>t('detail.breakdown.share',{duration:duration(host.ms),percent:percent(host)});
  const item=host=>t('detail.breakdown.item',{domain:host.domain,duration:duration(host.ms),percent:percent(host)});
  const option={animation:false,backgroundColor:'transparent',textStyle:{fontFamily,color:theme.label},grid:{left:8,right:12,top:8,bottom:8,containLabel:true},
    tooltip:tooltip({trigger:'axis',axisPointer:{type:'shadow'},renderMode:'richText',formatter:p=>`${hosts[p[0].dataIndex].domain}\n${share(hosts[p[0].dataIndex])}`}),
    xAxis:{type:'value',min:0,max:Math.max(...hosts.map(host=>host.ms),1)*2.8,show:false},
    yAxis:{type:'category',inverse:true,data:hosts.map(host=>host.domain),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:theme.labelStrong,fontSize:12,width:108,overflow:'truncate'}},
    series:[{type:'bar',barMaxWidth:16,itemStyle:{color:theme.bar,borderRadius:2},label:{show:true,position:'right',color:theme.labelMid,fontSize:11,overflow:'truncate',width:120,formatter:p=>share(hosts[p.dataIndex])},data:hosts.map(host=>host.ms)}]};
  return <><Chart option={option} className="breakdown-chart" height={Math.max(96,hosts.length*36+8)} label={t('detail.breakdown.label',{hosts:hosts.map(item).join(t('detail.breakdown.separator'))})}/>
    <ul className="sr-only">{hosts.map(host=><li key={host.domain}>{item(host)}</li>)}</ul></>;
}
