"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FloorBadges } from "@/components/floor-picker"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Visitor } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleDateString("ko-KR")
  } catch {
    return "-"
  }
}

export function DeletedVisitorsTable({
  visitors,
  onMutate,
}: {
  visitors: Visitor[]
  onMutate: () => void
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [floorVisitor, setFloorVisitor] = useState<Visitor | null>(null)

  async function handleRestore(id: string) {
    setPendingId(id)
    try {
      if (!id) {
        throw new Error("방문자 ID가 없습니다.")
      }

      const { error } = await supabase
        .from("visitors")
        .update({ status: "exited", deleted_at: null })
        .eq("id", id)

      if (error) {
        throw new Error(error.message || "복구에 실패했습니다.")
      }

      toast.success("복구되었습니다.")
      
      if (typeof onMutate === "function") {
        onMutate()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "오류가 발생했습니다."
      console.error("[Restore Error]:", { error: err, errorMessage })
      toast.error(errorMessage)
    } finally {
      setPendingId(null)
    }
  }

  if (!visitors || visitors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        삭제된 인원이 없습니다.
      </div>
    )
  }

  return (
    <>
    <Dialog open={floorVisitor !== null} onOpenChange={(open) => !open && setFloorVisitor(null)}><DialogContent><DialogHeader><DialogTitle>{floorVisitor?.name ?? "공사자"} · 작업층</DialogTitle></DialogHeader>{floorVisitor && <FloorBadges value={floorVisitor.floor ?? ""} />}</DialogContent></Dialog>
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead>이름</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>작업층 확인</TableHead>
            <TableHead>담당자 성함</TableHead>
            <TableHead>담당자 소속</TableHead>
            <TableHead>전화번호</TableHead>
            <TableHead className="text-center">등록일</TableHead>
            <TableHead className="text-center">삭제일</TableHead>
            <TableHead className="text-right">관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visitors.map((v) => {
            const busy = pendingId === v.id
            return (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{v.company ?? "-"}</TableCell>
                <TableCell><Button size="sm" variant="outline" onClick={() => setFloorVisitor(v)}>작업층 확인</Button></TableCell>
                <TableCell>{v.contact_name || v.contactName || "-"}</TableCell>
                <TableCell>{v.contact_company || v.contactCompany || "-"}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {v.phone ?? "-"}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {formatDate(v.registeredAt || v.registered_at)}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {formatDate(v.deletedAt || v.deleted_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => handleRestore(v.id)}
                  >
                    <RotateCcw className="size-4" />
                    복구
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
    </>
  )
}
