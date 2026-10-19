import React,{useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import * as echarts from 'echarts/core';
import {BarChart,CustomChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {midnight} from './model.mjs';
import {colorOf} from './data.js';
import {duration,formatDate,timeLabel} from './i18n.js';
echarts.use([BarChart,CustomChart,GridComponent,TooltipComponent,CanvasRenderer]);
function Chart({option,label,className,height}){
  const ref=useRef(null);
  useEffect(()=>{const chart=echarts.init(ref.current,null,{renderer:'canvas'});chart.setOption(option);
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current);
    return()=>{observer.disconnect();chart.dispose();};},[option]);
  return <div ref={ref} role="img" aria-label={label} className={className} style={height?{height}:undefined}/>;
}
export function Trend({days, label, className='trend-chart', variant='overview'}){
  const {t}=useTranslation();
  const detail=variant==='detail';
  const unrecorded=day=>day.recorded===false&&!day.ms;
  const option={animation:false,textStyle:{fontFamily:getComputedStyle(document.documentElement).fontFamily},grid:detail?{left:8,right:8,top:8,bottom:4,containLabel:true}:{left:56,right:10,top:12,bottom:52},
    tooltip:{trigger:'axis',renderMode:'richText',formatter:p=>{const day=days[p[0]?.dataIndex];if(!day)return '';return `${formatDate(day.at)}\n${unrecorded(day)?t('detail.trend.unrecorded'):t('active',{duration:duration((p[0].value??0)*3_600_000)})}`;}},
    xAxis:{type:'category',data:days.map(d=>d.at),axisTick:{show:false},axisLine:{lineStyle:{color:'#dfe6f2'}},axisLabel:{color:'#64748b',fontSize:detail?11:12,...(detail?{hideOverlap:true}:{}),interval:days.length>14?4:0,formatter:at=>`${formatDate(Number(at),{month:'numeric',day:'2-digit'})}\n${midnight(Number(at))===midnight(Date.now())?t('range.today'):formatDate(Number(at),{weekday:'short'})}`}},
    yAxis:{type:'value',min:0,minInterval:1,max:Math.max(6,...days.map(d=>Math.ceil(d.ms/3_600_000))),splitNumber:3,axisLabel:{color:'#64748b',...(detail?{fontSize:11}:{}),formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:'#e8edf6'}}},
    series:[{type:'bar',barMaxWidth:46,itemStyle:{color:'#2875ff',borderRadius:[2,2,0,0]},data:days.map(d=>unrecorded(d)?null:d.ms/3_600_000)}]};
  const summary=days.map(d=>`${formatDate(d.at)} ${unrecorded(d)?t('detail.trend.unrecorded'):duration(d.ms)}`).join(t('trend.separator'));
  return <Chart option={option} className={className} label={label??t('trend.label',{days:summary})}/>;
}
export function SiteTrend({days, domain}){
  const {t}=useTranslation();
  const item=day=>t('detail.trend.item',{date:formatDate(day.at),duration:day.recorded===false&&!day.ms?t('detail.trend.unrecorded'):duration(day.ms)});
  return <><Trend days={days} variant="detail" className="detail-trend" label={t('detail.trend.label',{domain,days:days.map(item).join(t('detail.trend.separator'))})}/><ul className="sr-only">{days.map(day=><li key={day.at}>{item(day)}</li>)}</ul></>;
}
export function HourChart({hours, dayCount, domain}){
  const {t}=useTranslation();
  const average=ms=>duration(dayCount?ms/dayCount:0);
  const slot=hour=>{const from=new Date(2000,0,1,hour,0,0,0);return t('detail.hours.slot',{from:timeLabel(from),to:timeLabel(from.getTime()+3_600_000)});};
  const item=row=>t('detail.hours.item',{hour:slot(row.hour),duration:duration(row.ms),average:t('detail.hours.average',{duration:average(row.ms)})});
  const option={animation:false,textStyle:{fontFamily:getComputedStyle(document.documentElement).fontFamily},grid:{left:4,right:8,top:8,bottom:4,containLabel:true},
    tooltip:{trigger:'axis',renderMode:'richText',formatter:p=>{const row=hours[p[0]?.dataIndex];if(!row)return '';return `${slot(row.hour)}\n${t('active',{duration:duration(row.ms)})}\n${t('detail.hours.average',{duration:average(row.ms)})}`;}},
    xAxis:{type:'category',data:hours.map(row=>row.hour),axisTick:{show:false},axisLine:{lineStyle:{color:'#dfe6f2'}},axisLabel:{color:'#64748b',fontSize:11,interval:2,hideOverlap:true}},
    yAxis:{type:'value',min:0,minInterval:1,max:Math.max(1,...hours.map(row=>Math.ceil(row.ms/3_600_000))),splitNumber:2,axisLabel:{color:'#64748b',fontSize:11,formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:'#e8edf6'}}},
    series:[{type:'bar',barMaxWidth:14,itemStyle:{color:'#2875ff',borderRadius:[2,2,0,0]},data:hours.map(row=>row.ms/3_600_000)}]};
  return <><Chart option={option} className="hour-chart" label={t('detail.hours.label',{domain,hours:hours.map(item).join(t('detail.hours.separator'))})}/><ul className="sr-only">{hours.map(row=><li key={row.hour}>{item(row)}</li>)}</ul></>;
}
export function Timeline({spans}){
  const {t}=useTranslation();
  const start=midnight(Date.now());const end=new Date(start);end.setDate(end.getDate()+1);
  const today=spans.filter(s=>s.end>start&&s.start<end.getTime());
  const earliest=today.length?Math.min(...today.map(s=>s.start)):start+8*3_600_000;
  const latest=today.length?Math.max(...today.map(s=>s.end)):start+20*3_600_000;
  const min=Math.max(start,Math.min(start+8*3_600_000,Math.floor(earliest/3_600_000)*3_600_000));
  const max=Math.min(end.getTime(),Math.max(start+20*3_600_000,Math.ceil(latest/3_600_000)*3_600_000));
  const option={animation:false,textStyle:{fontFamily:getComputedStyle(document.documentElement).fontFamily},grid:{left:14,right:16,top:30,bottom:10,show:true,backgroundColor:'#f2f5fa',borderWidth:0},
    tooltip:{renderMode:'richText',formatter:p=>{const s=today[p.dataIndex];const name=s.site||s.domain;return `${name}\n${timeLabel(Math.max(s.start,start))}–${timeLabel(Math.min(s.end,end.getTime()))}\n${duration(Math.min(s.end,end.getTime())-Math.max(s.start,start))}`;}},
    xAxis:{type:'value',min,max,interval:((max-min)/3_600_000>16?4:2)*3_600_000,position:'top',axisLine:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{color:'#64748b',fontSize:12,formatter:timeLabel}},
    yAxis:{show:false,min:0,max:1},
    series:[{type:'custom',data:today.map(s=>[Math.max(s.start,start),Math.min(s.end,end.getTime())]),renderItem:(params,api)=>{const from=api.coord([api.value(0),.5]),to=api.coord([api.value(1),.5]);const name=today[params.dataIndex].site||today[params.dataIndex].domain;return{type:'rect',shape:{x:from[0],y:from[1]-11,width:Math.max(1,to[0]-from[0]),height:22,r:3},style:{fill:colorOf(name)}};}}]};
  return <><Chart option={option} className="timeline-chart" label={t('timeline.label',{count:today.length})}/>{!today.length&&<p className="timeline-empty">{t('timeline.empty')}</p>}<ul className="sr-only">{today.map((s,i)=><li key={i}>{t('timeline.item',{domain:s.site||s.domain,from:timeLabel(s.start),to:timeLabel(s.end)})}</li>)}</ul></>;
}
export function Breakdown({hosts}){
  const {t}=useTranslation();
  const total=hosts.reduce((sum,host)=>sum+host.ms,0);
  const percent=host=>total?Math.round(host.ms*100/total):0;
  const share=host=>t('detail.breakdown.share',{duration:duration(host.ms),percent:percent(host)});
  const item=host=>t('detail.breakdown.item',{domain:host.domain,duration:duration(host.ms),percent:percent(host)});
  const option={animation:false,textStyle:{fontFamily:getComputedStyle(document.documentElement).fontFamily},grid:{left:8,right:12,top:8,bottom:8,containLabel:true},
    tooltip:{trigger:'axis',axisPointer:{type:'shadow'},renderMode:'richText',formatter:p=>`${hosts[p[0].dataIndex].domain}\n${share(hosts[p[0].dataIndex])}`},
    xAxis:{type:'value',min:0,max:Math.max(...hosts.map(host=>host.ms),1)*2.8,show:false},
    yAxis:{type:'category',inverse:true,data:hosts.map(host=>host.domain),axisTick:{show:false},axisLine:{show:false},axisLabel:{color:'#122040',fontSize:12,width:108,overflow:'truncate'}},
    series:[{type:'bar',barMaxWidth:16,itemStyle:{color:'#2875ff',borderRadius:2},label:{show:true,position:'right',color:'#40577b',fontSize:11,overflow:'truncate',width:120,formatter:p=>share(hosts[p.dataIndex])},data:hosts.map(host=>host.ms)}]};
  return <><Chart option={option} className="breakdown-chart" height={Math.max(96,hosts.length*36+8)} label={t('detail.breakdown.label',{hosts:hosts.map(item).join(t('detail.breakdown.separator'))})}/>
    <ul className="sr-only">{hosts.map(host=><li key={host.domain}>{item(host)}</li>)}</ul></>;
}
