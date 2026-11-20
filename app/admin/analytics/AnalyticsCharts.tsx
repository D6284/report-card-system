'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface Props {
  subjectData: { name: string; average: number }[];
  passFailData: { name: string; value: number; color: string }[];
  trendData: { label: string; average: number }[];
}

const axis = { fontSize: 11, fill: '#64748b' };
const tooltipStyle = { borderRadius: 12, border: '1px solid #e6e9f0', boxShadow: '0 12px 32px -14px rgb(15 23 42 / 0.18)', fontSize: 12 };

export default function AnalyticsCharts({ subjectData, passFailData, trendData }: Props) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card animate-in">
        <div className="card-header"><div><h3 className="card-title">Subject performance</h3><p className="card-subtitle">Average mark out of 20 by subject</p></div><span className="badge badge-brand">/20</span></div>
        <div className="card-body">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} tick={axis} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 20]} tick={axis} tickLine={false} axisLine={false} />
                <Tooltip formatter={(val: number) => [`${Number(val).toFixed(2)} / 20`, 'Average']} contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="average" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card animate-in delay-1">
        <div className="card-header"><div><h3 className="card-title">Pass / fail outcome</h3><p className="card-subtitle">Share of students meeting the passing average</p></div></div>
        <div className="card-body">
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={passFailData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={95} paddingAngle={5}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {passFailData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="card animate-in delay-2 lg:col-span-2">
        <div className="card-header"><div><h3 className="card-title">Performance trend</h3><p className="card-subtitle">Average by term and sequence from approved marks</p></div></div>
        <div className="card-body">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 20]} tick={axis} tickLine={false} axisLine={false} />
                <Tooltip formatter={(val: number) => [`${Number(val).toFixed(2)} / 20`, 'Average']} contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="average" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}
