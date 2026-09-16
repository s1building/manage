"use client"

import { useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export const FLOOR_OPTIONS = [
  "P2층",
  "P1층",
  ...Array.from({ length: 42 }, (_, index) => `${42 - index}층`).filter((floor) => floor !== "4층" && floor !== "13층"),
  ...Array.from({ length: 8 }, (_, index) => `지하 ${index + 1}층`),
  "외부",
]

export function parseFloors(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean) }

export function sortFloors(floors: string[]) {
  const score = (floor: string) => {
    const basement = floor.match(/^지하\s*(\d+)층$/)
    if (basement) return -Number(basement[1])
    const parking = floor.match(/^P(\d+)층$/i)
    if (parking) return 1000 + Number(parking[1])
    if (floor === "외부") return -10000
    const above = floor.match(/^(\d+)층$/)
    return above ? Number(above[1]) : -9999
  }
  return [...floors].sort((a, b) => score(b) - score(a))
}

export function FloorPicker({ value, onChange, label = "작업층 확인" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(parseFloors(value))
  const allFloorsSelected = draft.length === FLOOR_OPTIONS.length && FLOOR_OPTIONS.every((floor) => draft.includes(floor))
  function toggle(floor: string) { setDraft((current) => current.includes(floor) ? current.filter((item) => item !== floor) : [...current, floor]) }
  return <>
    <Button type="button" variant="outline" onClick={() => { setDraft(parseFloors(value)); setOpen(true) }} className="w-full justify-between"><span className="truncate text-left">{value || label}</span><ChevronDown className="size-4 shrink-0" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="flex max-h-[90dvh] max-w-lg flex-col overflow-hidden p-4 sm:p-6"><DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">원하는 층을 하나씩 눌러 선택하거나 해제하세요.</p><Button type="button" variant={allFloorsSelected ? "default" : "secondary"} className="w-full" onClick={() => setDraft(allFloorsSelected ? [] : [...FLOOR_OPTIONS])}>{allFloorsSelected ? "전층선택 취소" : "전층선택"}</Button><div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain px-1 pb-2 select-none touch-pan-y sm:grid-cols-4">{FLOOR_OPTIONS.map((floor) => { const selected = draft.includes(floor); return <button key={floor} type="button" onClick={() => toggle(floor)} className={`min-h-11 rounded-lg border px-1 text-sm font-semibold transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}><span className="flex items-center justify-center gap-1">{selected && <Check className="size-3.5" />}{floor}</span></button> })}</div><DialogFooter><Button type="button" onClick={() => { onChange(draft.join(", ")); setOpen(false) }}>선택 완료 ({draft.length})</Button></DialogFooter></DialogContent></Dialog>
  </>
}

export function FloorBadges({ value }: { value: string }) { return <div className="flex flex-wrap gap-1">{sortFloors(parseFloors(value)).map((floor) => <span key={floor} className="rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">{floor}</span>)}</div> }
