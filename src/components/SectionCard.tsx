import type { PropsWithChildren } from 'react'

type SectionCardProps = PropsWithChildren<{
  title: string
  description: string
}>

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-[1.75rem] border border-white/50 bg-white/78 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
          {title}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {children}
    </section>
  )
}
