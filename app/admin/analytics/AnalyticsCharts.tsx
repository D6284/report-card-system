'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

interface Props {
  subjectData: { name: string; average: number }[];
  passFailData: { name: string; value: number; color: string }[];
  trendData: { label: string; average: number }[];
}

function ChartSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
      <section className="card">
        <div className="card-header"><div className="h-5 w-40 animate-pulse rounded bg-slate-100" /></div>
        <div className="card-body"><div className="h-72 animate-pulse rounded-xl bg-slate-100" /></div>
      </section>
      <section className="card">
        <div className="card-header"><div className="h-5 w-36 animate-pulse rounded bg-slate-100" /></div>
        <div className="card-body"><div className="h-72 animate-pulse rounded-xl bg-slate-100" /></div>
      </section>
      <section className="card lg:col-span-2">
        <div className="card-header"><div className="h-5 w-36 animate-pulse rounded bg-slate-100" /></div>
        <div className="card-body"><div className="h-64 animate-pulse rounded-xl bg-slate-100" /></div>
      </section>
    </div>
  );
}

const AnalyticsChartContent = dynamic(() => import('./AnalyticsChartContent'), {
  ssr: false,
  loading: ChartSkeleton,
});

export default function AnalyticsCharts(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element || !('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={container} role={shouldLoad ? undefined : 'status'} aria-label={shouldLoad ? undefined : 'Loading analytics charts'} aria-busy={!shouldLoad}>
      {shouldLoad ? <AnalyticsChartContent {...props} /> : <ChartSkeleton />}
    </div>
  );
}
