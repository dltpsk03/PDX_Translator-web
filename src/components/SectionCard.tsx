import type { PropsWithChildren } from 'react'

type SectionCardProps = PropsWithChildren<{
  title: string
  description: string
}>

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="border border-slate-300 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}
