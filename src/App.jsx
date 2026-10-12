import React, { useEffect, useRef, useState } from 'react';
import { ChartBar, Clock, GearSix, ShieldCheck, Pause, Play, ArrowRight, GlobeHemisphereWest, MagnifyingGlass, X, Trash, CaretDown, CalendarBlank } from '@phosphor-icons/react';
import { Button } from '@app/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@app/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@app/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@app/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@app/components/ui/sidebar';
import { TooltipProvider } from '@app/components/ui/tooltip';
import { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton } from '@app/components/ui/input-group';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@app/components/ui/table';
import { Alert, AlertTitle, AlertDescription } from '@app/components/ui/alert';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@app/components/ui/empty';
import { Avatar, AvatarImage, AvatarFallback } from '@app/components/ui/avatar';
import { ScrollArea } from '@app/components/ui/scroll-area';
import { blankData, duration, midnight, summarize } from './model.mjs';
import { command, isExtension, knownSites, colorOf } from './data.js';
import { Trend, Timeline, timeLabel } from './Charts.jsx';

const dateLabel = at => new Date(at).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const rangeLabel = range => range === 1 ? '今天' : `最近 ${range} 天`;

function SiteIcon({ domain }) {
  return <Avatar className="site-icon rounded-none after:hidden">
    {knownSites.includes(domain) && <AvatarImage className="rounded-none object-contain" src={`./assets/${domain}.svg`} alt="" />}
    <AvatarFallback className="rounded-none bg-transparent"><GlobeHemisphereWest size={23} /></AvatarFallback>
  </Avatar>;
}

export function App() {
  const [data, setData] = useState(blankData), [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [page, setPage] = useState('overview'), [range, setRange] = useState(7), [search, setSearch] = useState(''), [expanded, setExpanded] = useState(false), [selected, setSelected] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const detailTrigger = useRef(null);
  async function act(type = 'snapshot') {
    setBusy(true);
    try { setData(await command(type)); setError(''); setReady(true); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => { act(); const timer = setInterval(() => act(), 30_000); return () => clearInterval(timer); }, []);
  const now = Date.now(), today = midnight(now);
  const fromDate = new Date(today); fromDate.setDate(fromDate.getDate() - range + 1);
  const start = fromDate.getTime();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.getTime();
  const stats = summarize(data, start, end), todayStats = summarize(data, today, end);
  const visits = data.visits.filter(v => v.at >= start && v.at < end && v.domain.includes(search.trim().toLowerCase())).sort((a, b) => b.at - a.at);
  const title = { overview: '浏览概览', records: '访问记录', settings: '设置' }[page];
  const goRecords = (domain = '') => { setSearch(domain); setPage('records'); };
  const openSite = (domain, event) => { detailTrigger.current = event.currentTarget; setSelected(domain); };
  const sessions = data.spans.filter(s => s.domain === selected && s.end > today && s.start < end);

  return <TooltipProvider><AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
    <SidebarProvider className="app-shell">
      <Sidebar collapsible="none" className="sidebar">
        <SidebarHeader className="p-0"><div className="brand"><ChartBar size={32} weight="bold" /><span>PageTime</span></div></SidebarHeader>
        <SidebarContent className="sidebar-navigation"><nav aria-label="主要导航"><SidebarMenu className="navigation-menu">
          {[['overview', ChartBar, '概览'], ['records', Clock, '访问记录'], ['settings', GearSix, '设置']].map(([key, Icon, label]) =>
            <SidebarMenuItem key={key}><SidebarMenuButton className="nav-item" size="lg" isActive={page === key} aria-current={page === key ? 'page' : undefined} onClick={() => setPage(key)}><Icon /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></nav></SidebarContent>
        <SidebarFooter className="local-note"><ShieldCheck size={21} /><span>数据仅保存在此设备</span></SidebarFooter>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="record-status"><span className={`status-dot ${data.enabled ? '' : 'paused'}`} /><div><strong>{data.enabled ? '正在记录浏览数据' : '已暂停记录'}</strong><small>{!isExtension ? '演示数据 · 不采集浏览行为' : `自 ${new Date(data.since).toLocaleDateString('zh-CN')} 开始`}</small></div></div>
          <Button variant="outline" className="action-button" disabled={busy || !ready} onClick={() => act('toggle')}>{data.enabled ? <Pause weight="fill" /> : <Play weight="fill" />}{data.enabled ? '暂停记录' : '继续记录'}</Button>
        </header>
        <main>
          <div className="page-header"><div><h1>{title}</h1><p>{page === 'overview' ? '了解你在网页上的时间分布与访问情况' : page === 'records' ? '每一次访问，都有迹可循' : '掌握自己的数据与记录方式'}</p></div>
            {page !== 'settings' && <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="range" />} aria-label={`统计时间范围：${rangeLabel(range)}`}>
                <CalendarBlank /><span>{rangeLabel(range)}</span>{range !== 1 && <span className="range-dates">{new Date(start).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}–{new Date(today).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>}<CaretDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuRadioGroup value={String(range)} onValueChange={value => setRange(Number(value))}>
                {[1, 7, 30].map(value => <DropdownMenuRadioItem closeOnClick key={value} value={String(value)}>{rangeLabel(value)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup></DropdownMenuContent>
            </DropdownMenu>}
          </div>
          {error && <Alert variant="destructive" className="my-4"><AlertTitle>读取或保存失败</AlertTitle><AlertDescription>{error}<Button variant="link" size="sm" onClick={() => act()}>重试</Button></AlertDescription></Alert>}
          {!ready && !error ? <p className="py-8 text-center text-muted-foreground">正在读取本地记录…</p> : page === 'overview' ? <>
            <section className="summary" aria-label="汇总"><div className="total-time">{duration(stats.ms)}</div><p>总活跃浏览时间</p><div className="totals">访问 <strong>{stats.visits}</strong> 次<span>·</span><strong>{stats.rows.length}</strong> 个站点</div></section>
            <Trend data={data} start={start} end={end} />
            <section className="timeline-section"><h2>今日时间线</h2><p>{dateLabel(now)}<span>·</span>活跃 {duration(todayStats.ms)}</p><Timeline spans={data.spans} />
              <div className="legend">{todayStats.rows.filter(r => r.ms).slice(0, 5).map(r => r.domain).map(domain => <Button variant="ghost" size="xs" key={domain} onClick={event => openSite(domain, event)}><i style={{ background: colorOf(domain) }} />{domain}</Button>)}<span className="idle-legend"><i />空闲时间</span></div>
            </section>
            <section className="ranking"><h2>站点排行</h2>
              <Table><TableHeader><TableRow><TableHead className="rank-col">#</TableHead><TableHead>站点</TableHead><TableHead>活跃时间</TableHead><TableHead>访问次数</TableHead></TableRow></TableHeader><TableBody>
                {stats.rows.slice(0, expanded ? undefined : 5).map((site, i) => <TableRow key={site.domain}><TableCell>{i + 1}</TableCell><TableCell><Button variant="ghost" className="site-link" onClick={event => openSite(site.domain, event)}><SiteIcon domain={site.domain} /><span>{site.domain}</span></Button></TableCell><TableCell>{duration(site.ms)}</TableCell><TableCell>{site.visits}</TableCell></TableRow>)}
              </TableBody></Table>
              {!stats.rows.length && <Empty><EmptyHeader><EmptyMedia><GlobeHemisphereWest size={32} /></EmptyMedia><EmptyTitle>你的浏览足迹，从这里开始</EmptyTitle><EmptyDescription>{isExtension ? '访问一个网页后，记录会自动出现在这里。' : '演示记录已清空，可在设置中恢复。'}</EmptyDescription></EmptyHeader></Empty>}
              {!!stats.rows.length && <div className="table-footer"><Button variant="link" className="px-0" onClick={() => setExpanded(!expanded)}>{expanded ? '收起列表' : `查看全部 ${stats.rows.length} 个站点`}<ArrowRight /></Button><Button className="action-button" onClick={event => openSite(stats.rows[0].domain, event)}>查看站点详情<ArrowRight /></Button></div>}
            </section>
          </> : page === 'records' ? <section className="records">
            <InputGroup className="h-11 max-w-[460px]"><InputGroupInput aria-label="搜索站点" placeholder="搜索站点，例如 github.com" value={search} onChange={e => setSearch(e.target.value)} /><InputGroupAddon><MagnifyingGlass /></InputGroupAddon>{search && <InputGroupAddon align="inline-end"><InputGroupButton size="icon-sm" aria-label="清空搜索" onClick={() => setSearch('')}><X /></InputGroupButton></InputGroupAddon>}</InputGroup>
            <p className="muted">{visits.length} 次访问{visits.length > 200 ? ' · 显示最近 200 条' : ''}</p>
            <Table><TableHeader><TableRow><TableHead>站点</TableHead><TableHead>访问时间</TableHead><TableHead>详情</TableHead></TableRow></TableHeader><TableBody>
              {visits.slice(0, 200).map((visit, i) => <TableRow key={`${visit.at}-${i}`}><TableCell><div className="site-link"><SiteIcon domain={visit.domain} />{visit.domain}</div></TableCell><TableCell>{new Date(visit.at).toLocaleDateString('zh-CN')} {timeLabel(visit.at)}</TableCell><TableCell><Button variant="link" className="px-0" onClick={event => openSite(visit.domain, event)}>查看<ArrowRight /></Button></TableCell></TableRow>)}
            </TableBody></Table>
            {!visits.length && <Empty><EmptyHeader><EmptyTitle>没有符合条件的访问记录</EmptyTitle></EmptyHeader></Empty>}
          </section> : <section className="settings">
            <div className="setting-row"><div><h2>浏览记录</h2><p>记录网页访问次数，仅累计前台窗口中活跃标签页的浏览时间。</p></div><Button variant="outline" className="action-button" disabled={busy} onClick={() => act('toggle')}>{data.enabled ? '暂停记录' : '开启记录'}</Button></div>
            <div className="setting-row"><div><h2>本地与私密</h2><p>只保存站点域名、时间和访问次数，不保存页面正文、标题或完整网址。<br />忽略无痕窗口和浏览器内部页面，不发送数据到服务器。</p></div><ShieldCheck size={28} className="privacy-icon" /></div>
            <div className="setting-row"><div><h2>统计方式</h2><p>页面加载与刷新各计一次访问；切换标签不增加次数，单页应用内部跳转不重复计数。<br />连续 60 秒无系统操作视为空闲，每 30 秒保存一次。<br />最多保留 90 天数据，访问记录与活跃时段各最多保留 20,000 条。</p></div></div>
            {!isExtension && <div className="setting-row"><div><h2>演示模式</h2><p>当前是界面预览，数据与真实插件独立，浏览网站不会产生新记录。</p></div><Button variant="outline" className="action-button" onClick={() => { localStorage.removeItem('jilan-demo-v1'); act(); }}>恢复演示数据</Button></div>}
            <div className="setting-row"><div><h2>清空所有记录</h2><p>删除此设备上 PageTime 已保存的记录，删除后无法恢复。</p></div><AlertDialogTrigger render={<Button variant="destructive" className="action-button" disabled={busy} />}><Trash />清空数据</AlertDialogTrigger></div>
          </section>}
        </main>
      </div>
    </SidebarProvider>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px] p-7" finalFocus={detailTrigger} showCloseButton={false}>
        <DialogHeader><DialogTitle className="text-xl">站点详情</DialogTitle><DialogDescription>{rangeLabel(range)}的站点统计与今日活跃时段</DialogDescription></DialogHeader>
        <DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute right-4 top-4" />} aria-label="关闭详情"><X /></DialogClose>
        {selected && <><div className="detail-site"><SiteIcon domain={selected} /><h3>{selected}</h3></div>
          <div className="detail-stats"><div><strong>{duration(stats.rows.find(r => r.domain === selected)?.ms || 0)}</strong><span>活跃时间</span></div><div><strong>{stats.rows.find(r => r.domain === selected)?.visits || 0} 次</strong><span>访问次数</span></div></div>
          <h3>今日活跃时段</h3>
          {sessions.length ? <ScrollArea className="h-[230px]"><ul className="session-list">{sessions.map((s, i) => <li key={i}><time>{timeLabel(Math.max(today, s.start))} — {timeLabel(Math.min(end, s.end))}</time><span>{duration(Math.min(end, s.end) - Math.max(today, s.start))}</span></li>)}</ul></ScrollArea> : <p className="muted">今天暂无活跃时段</p>}
          <Button className="action-button w-full" onClick={() => { goRecords(selected); setSelected(null); }}>查看访问记录<ArrowRight /></Button>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>清空所有浏览记录？</AlertDialogTitle><AlertDialogDescription>此操作只删除 PageTime 的本地数据，删除后无法恢复。</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={async () => { if (await act('clear')) setConfirmClear(false); }}>{busy ? '正在清空…' : '确认清空'}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog></TooltipProvider>;
}
