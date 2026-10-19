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
function Chart({option,label,className}){
  const ref=useRef(null);
  useEffect(()=>{const chart=echarts.init(ref.current,null,{renderer:'canvas'});chart.setOption(option);
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current);
    return()=>{observer.disconnect();chart.dispose();};},[option]);
  return <div ref={ref} role="img" aria-label={label} className={className}/>;
}
export function Trend({days}){
  const {t}=useTranslation();
  const option={animation:false,textStyle:{fontFamily:getComputedStyle(document.documentElement).fontFamily},grid:{left:56,right:10,top:12,bottom:52},
    tooltip:{trigger:'axis',renderMode:'richText',formatter:p=>`${formatDate(days[p[0].dataIndex].at)}\n${t('active',{duration:duration(p[0].value*3_600_000)})}`},
    xAxis:{type:'category',data:days.map(d=>d.at),axisTick:{show:false},axisLine:{lineStyle:{color:'#dfe6f2'}},axisLabel:{color:'#64748b',fontSize:12,interval:days.length>14?4:0,formatter:at=>`${formatDate(Number(at),{month:'numeric',day:'2-digit'})}\n${midnight(Number(at))===midnight(Date.now())?t('range.today'):formatDate(Number(at),{weekday:'short'})}`}},
    yAxis:{type:'value',min:0,minInterval:1,max:Math.max(6,...days.map(d=>Math.ceil(d.ms/3_600_000))),splitNumber:3,axisLabel:{color:'#64748b',formatter:v=>v?t('trend.hours',{count:v}):'0'},splitLine:{lineStyle:{color:'#e8edf6'}}},
    series:[{type:'bar',barMaxWidth:46,itemStyle:{color:'#2875ff',borderRadius:[2,2,0,0]},data:days.map(d=>d.ms/3_600_000)}]};
  return <Chart option={option} className="trend-chart" label={t('trend.label',{days:days.map(d=>`${formatDate(d.at)} ${duration(d.ms)}`).join(t('trend.separator'))})}/>;
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
    tooltip:{renderMode:'richText',formatter:p=>{const s=today[p.dataIndex];return `${s.domain}\n${timeLabel(Math.max(s.start,start))}–${timeLabel(Math.min(s.end,end.getTime()))}\n${duration(Math.min(s.end,end.getTime())-Math.max(s.start,start))}`;}},
    xAxis:{type:'value',min,max,interval:((max-min)/3_600_000>16?4:2)*3_600_000,position:'top',axisLine:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{color:'#64748b',fontSize:12,formatter:timeLabel}},
    yAxis:{show:false,min:0,max:1},
    series:[{type:'custom',data:today.map(s=>[Math.max(s.start,start),Math.min(s.end,end.getTime())]),renderItem:(params,api)=>{const from=api.coord([api.value(0),.5]),to=api.coord([api.value(1),.5]);return{type:'rect',shape:{x:from[0],y:from[1]-11,width:Math.max(1,to[0]-from[0]),height:22,r:3},style:{fill:colorOf(today[params.dataIndex].domain)}};}}]};
  return <><Chart option={option} className="timeline-chart" label={t('timeline.label',{count:today.length})}/>{!today.length&&<p className="timeline-empty">{t('timeline.empty')}</p>}<ul className="sr-only">{today.map((s,i)=><li key={i}>{t('timeline.item',{domain:s.domain,from:timeLabel(s.start),to:timeLabel(s.end)})}</li>)}</ul></>;
}
