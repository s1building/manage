"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import { FileText, MessageCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ChatPanel } from "@/components/chat-panel"
import { FloorBadges, FloorPicker, sortFloors } from "@/components/floor-picker"
import type { Visitor, ChatMessage } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()

type VisitorStatus = Visitor["status"]

const PORTAL_URL = "http://kor1.samsung.net/portalapp/home"

async function copyForPortal(value: string, label: string, portalSearchMode: boolean) {
  if (!portalSearchMode || !window.matchMedia("(min-width: 1024px)").matches) return
  const text = label === "전화번호" ? value.replace(/\D/g, "").slice(-4) : value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`'${text}' 복사 완료! 포털 검색창에 [Ctrl+V]를 누르세요.`)
    window.open(PORTAL_URL, "_blank", "noopener,noreferrer")
  } catch {
    toast.error("클립보드 복사에 실패했습니다.")
  }
}

const PORTAL_CELL_CLASS = "hidden lg:table-cell cursor-pointer transition-colors hover:bg-primary/10 hover:text-primary"

const STATUS_META: Record<VisitorStatus, { label: string; className: string }> = {
  pending: {
    label: "승인 대기",
    className: "border-yellow-900 bg-yellow-400 px-2.5 py-1 font-black text-black shadow-md",
  },
  onsite: {
    label: "재실 중",
    className: "border-green-900 bg-green-500 px-2.5 py-1 font-black text-black shadow-md",
  },
  exited: {
    label: "퇴실",
    className: "border-slate-950 bg-slate-500 px-2.5 py-1 font-black text-white shadow-md",
  },
  deleted: {
    label: "삭제됨",
    className: "bg-destructive/15 text-destructive border-destructive/20",
  },
}

function VisitorRow({
  visitor,
  busy,
  onAct,
  onOpenChat,
  onOpenMemo,
  onOpenFloors,
  onOpenEdit,
  isChatOpen,
  portalSearchMode,
}: {
  visitor: Visitor & { displayEnteredAt?: string; displayExitedAt?: string }
  busy: boolean
  onAct: (id: string, action: "approve" | "exit" | "delete" | "restore") => void
  onOpenChat: (visitor: Visitor) => void
  onOpenMemo: (visitor: Visitor) => void
  onOpenFloors: (visitor: Visitor) => void
  onOpenEdit: (visitor: Visitor) => void
  isChatOpen: boolean
  portalSearchMode: boolean
}) {
  const meta = STATUS_META[visitor.status] || STATUS_META.pending
  const [rawMessages, setRawMessages] = useState<ChatMessage[]>([])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("visitor_id", visitor.id)
      .order("created_at", { ascending: true })

    if (!error && data) {
      setRawMessages(data as ChatMessage[])
    }
  }, [visitor.id])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, isChatOpen ? 1000 : 1000)
    return () => clearInterval(interval)
  }, [fetchMessages, isChatOpen])

  const hasUnread = Array.isArray(rawMessages) && rawMessages.some((m) => {
    const isWorker = m.sender === "worker"
    const isRead = m.isRead ?? (m as any).is_read ?? false
    return isWorker && !isRead
  })

  const seenUnreadIds = useRef<Set<string>>(new Set())
  const initializedUnread = useRef(false)

  useEffect(() => {
    const unreadMessages = rawMessages.filter((message) => {
      const isRead = message.isRead ?? (message as any).is_read ?? false
      return message.sender === "worker" && !isRead
    })
    const unreadIds = new Set(unreadMessages.map((message) => String(message.id)))
    if (initializedUnread.current) {
      const newMessage = unreadMessages.find((message) => !seenUnreadIds.current.has(String(message.id)))
      if (newMessage) {
        const messageText = (newMessage as any).content || newMessage.text || (newMessage as any).message || "새 메시지가 도착했습니다."
        toast.info(`${visitor.name} 공사자 메시지`, {
          description: messageText,
          duration: 10000,
          className: "border-2 border-blue-600 bg-white text-slate-950 shadow-xl",
          descriptionClassName: "text-slate-700",
          action: {
            label: "채팅 열기",
            onClick: () => {
              onOpenChat(visitor)
              markAsRead()
            },
          },
        })
      }
    }
    seenUnreadIds.current = unreadIds
    initializedUnread.current = true
  }, [rawMessages, visitor.name])

  const markAsRead = useCallback(async () => {
    try {
      await supabase
      .from("chat_messages")
        .update({ is_read: true })
        .eq("visitor_id", visitor.id)
        .eq("sender", "worker")
      fetchMessages()
    } catch (err) {
      console.error("읽음 처리 실패:", err)
    }
  }, [visitor.id, fetchMessages])

  useEffect(() => {
    if (isChatOpen && hasUnread) {
      markAsRead()
    }
  }, [isChatOpen, hasUnread, markAsRead])

  const memoValue = visitor.memo
  const hasMemo = Boolean(memoValue && String(memoValue).trim().length > 0)

  return (
    <TableRow>
      <TableCell className={`${PORTAL_CELL_CLASS} font-medium`} onClick={() => copyForPortal(visitor.name ?? "", "이름", portalSearchMode)}>{visitor.name ?? "-"}</TableCell>
      <TableCell className={`${PORTAL_CELL_CLASS} text-muted-foreground`} onClick={() => copyForPortal(visitor.company ?? "", "소속", portalSearchMode)}>{visitor.company ?? "-"}</TableCell>
      <TableCell><Button type="button" variant="outline" size="sm" className="whitespace-nowrap" onClick={() => onOpenFloors(visitor)} title="작업층 확인">작업층 확인</Button></TableCell>
      <TableCell className={`${PORTAL_CELL_CLASS} font-mono text-xs text-muted-foreground`} onClick={() => copyForPortal(visitor.phone ?? "", "전화번호", portalSearchMode)}>
        {visitor.phone ?? "-"}
      </TableCell>
      <TableCell className={PORTAL_CELL_CLASS} onClick={() => copyForPortal(visitor.contact_name || visitor.contactName || "", "담당자 성함", portalSearchMode)}>{visitor.contact_name || visitor.contactName || "-"}</TableCell>
      <TableCell className={PORTAL_CELL_CLASS} onClick={() => copyForPortal(visitor.contact_company || visitor.contactCompany || "", "담당자 소속", portalSearchMode)}>{visitor.contact_company || visitor.contactCompany || "-"}</TableCell>
      
      <TableCell className="text-center font-mono text-xs tabular-nums">
        {visitor.displayEnteredAt ?? "-"}
      </TableCell>

      <TableCell className="text-center font-mono text-xs tabular-nums">
        {visitor.displayExitedAt ?? "-"}
      </TableCell>

      <TableCell className="text-center">
        <Badge variant="outline" className={meta.className}>
          {meta.label}
        </Badge>
      </TableCell>
      
      <TableCell className="text-center">
        <Button
          size="icon"
          variant="ghost"
          className="relative size-8"
          onClick={() => onOpenMemo(visitor)}
          title={hasMemo ? `메모: ${memoValue}` : "메모 작성"}
          aria-label={`${visitor.name ?? "방문자"} 메모 ${hasMemo ? "확인" : "작성"}`}
        >
          <FileText className={`size-4 ${hasMemo ? "fill-primary/10 text-primary" : "text-muted-foreground"}`} />
          {hasMemo && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      </TableCell>

      <TableCell className="text-center">
        <div className="relative inline-block">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => {
              onOpenChat(visitor)
              if (hasUnread) {
                markAsRead()
              }
            }}
            aria-label={`${visitor.name ?? "방문자"} 채팅 열기`}
          >
            <MessageCircle className="size-4" />
          </Button>
          {hasUnread && (
            <span className="absolute top-0 right-0 size-2.5 animate-pulse rounded-full bg-destructive" />
          )}
        </div>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {visitor.status === "pending" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onAct(visitor.id, "approve")}>
                승인
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenEdit(visitor)} aria-label={`${visitor.name ?? "방문자"} 정보 수정`}>수정하기</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAct(visitor.id, "delete")}
                aria-label={`${visitor.name ?? "방문자"} 항목 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          {visitor.status === "onsite" && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onAct(visitor.id, "exit")}
              >
                퇴실
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenEdit(visitor)} aria-label={`${visitor.name ?? "방문자"} 정보 수정`}>수정하기</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAct(visitor.id, "delete")}
                aria-label={`${visitor.name ?? "방문자"} 항목 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
          {visitor.status === "exited" && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenEdit(visitor)} aria-label={`${visitor.name ?? "방문자"} 정보 수정`}>수정하기</Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAct(visitor.id, "delete")}
                aria-label={`${visitor.name ?? "방문자"} 항목 삭제`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export function VisitorTable({
  visitors,
  onMutate,
  portalSearchMode,
}: {
  visitors: Visitor[]
  onMutate: () => void
  portalSearchMode: boolean
}) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [chatWith, setChatWith] = useState<Visitor | null>(null)
  const [floorVisitor, setFloorVisitor] = useState<Visitor | null>(null)
  const [editVisitor, setEditVisitor] = useState<Visitor | null>(null)
  const [editForm, setEditForm] = useState({ name: "", company: "", floor: "", phone: "", contact_name: "", contact_company: "", status: "pending" as Visitor["status"] })
  const [savingEdit, setSavingEdit] = useState(false)
  
  const [memoVisitor, setMemoVisitor] = useState<Visitor | null>(null)
  const [memoText, setMemoText] = useState("")
  const [savingMemo, setSavingMemo] = useState(false)

  const handleOpenEdit = (visitor: Visitor) => {
    setEditVisitor(visitor)
    setEditForm({
      name: visitor.name || "",
      company: visitor.company || "",
      floor: visitor.floor || "",
      phone: visitor.phone || "",
      contact_name: visitor.contact_name || visitor.contactName || "",
      contact_company: visitor.contact_company || visitor.contactCompany || "",
      status: visitor.status,
    })
  }

  const handleSaveEdit = async () => {
    if (!editVisitor) return
    setSavingEdit(true)
    try {
      const now = new Date().toISOString()
      const payload = {
        name: editForm.name,
        company: editForm.company,
        floor: editForm.floor,
        phone: editForm.phone.trim(),
        contact_name: editForm.contact_name,
        contact_company: editForm.contact_company,
        status: editForm.status,
        deleted_at: editVisitor.deleted_at,
        exited_at: editForm.status === "exited" ? editVisitor.exited_at || now : null,
        entered_at: editVisitor.entered_at || null,
      }
      const { error } = await supabase.from("visitors").update(payload).eq("id", editVisitor.id)
      if (error) throw error
      toast.success("방문자 정보가 수정되었습니다.")
      setEditVisitor(null)
      onMutate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "수정에 실패했습니다.")
    } finally {
      setSavingEdit(false)
    }
  }

  const handleOpenMemo = (visitor: Visitor) => {
    setMemoVisitor(visitor)
    setMemoText(visitor.memo || (visitor as any).memo || "")
  }

  const handleSaveMemo = async () => {
    if (!memoVisitor) return
    setSavingMemo(true)
    try {
      const { error } = await supabase
        .from("visitors")
        .update({ memo: memoText })
        .eq("id", memoVisitor.id)

      if (error) throw new Error(error.message || "메모 저장에 실패했습니다.")

      toast.success("메모가 저장되었습니다.")
      setMemoVisitor(null)
      if (typeof onMutate === "function") {
        onMutate()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류가 발생했습니다.")
    } finally {
      setSavingMemo(false)
    }
  }

  async function act(id: string, action: "approve" | "exit" | "delete" | "restore") {
    setPendingId(id)
    try {
      if (!id) throw new Error("방문자 ID가 없습니다.")

      let updatePayload: Record<string, any> = {}
      const now = new Date().toISOString()

      if (action === "approve") {
        updatePayload = { status: "onsite", entered_at: now }
      } else if (action === "exit") {
        updatePayload = { status: "exited", exited_at: now }
      } else if (action === "delete") {
        updatePayload = { status: "deleted", deleted_at: now, exited_at: now }
      } else if (action === "restore") {
        // 복구해도 삭제 당시의 퇴실 상태와 시간은 유지합니다.
        updatePayload = { deleted_at: null }
      }

      const { error } = await supabase
        .from("visitors")
        .update(updatePayload)
        .eq("id", id)

      if (error) throw new Error(error.message || "처리에 실패했습니다.")

      const messages: Record<string, string> = {
        approve: "승인되어 입실 처리되었습니다.",
        exit: "퇴실 처리되었습니다.",
        delete: "삭제 처리되어 삭제된 인원 목록으로 이동했습니다.",
        restore: "복구되었습니다.",
      }
      
      toast.success(messages[action] || "처리되었습니다.")
      if (typeof onMutate === "function") {
        onMutate()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "오류가 발생했습니다."
      toast.error(errorMessage)
    } finally {
      setPendingId(null)
    }
  }

  if (!Array.isArray(visitors) || visitors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        아직 등록된 방문자가 없습니다.
      </div>
    )
  }

  return (
    <>
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
<TableHead>이름</TableHead>
            <TableHead>소속</TableHead>
            <TableHead>작업층</TableHead>
            <TableHead className="hidden lg:table-cell">전화번호</TableHead>
            <TableHead>담당자 성함</TableHead>
            <TableHead>담당자 소속</TableHead>
              <TableHead className="text-center">입실</TableHead>
              <TableHead className="text-center">퇴실</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead className="text-center">메모</TableHead>
              <TableHead className="text-center">문의</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visitors.map((v) => (
              <VisitorRow
                key={v.id}
                visitor={v}
                busy={pendingId === v.id}
                onAct={act}
                onOpenChat={(visitor) => setChatWith(visitor)}
                onOpenMemo={handleOpenMemo}
                onOpenFloors={(visitor) => setFloorVisitor(visitor)}
                onOpenEdit={handleOpenEdit}
                isChatOpen={chatWith?.id === v.id}
                portalSearchMode={portalSearchMode}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editVisitor !== null} onOpenChange={(open) => !open && setEditVisitor(null)}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>방문자 정보 수정</DialogTitle></DialogHeader><div className="grid gap-4 py-2"><Input aria-label="이름" value={editForm.name} onChange={(e) => setEditForm((form) => ({ ...form, name: e.target.value }))} placeholder="이름" /><Input aria-label="소속" value={editForm.company} onChange={(e) => setEditForm((form) => ({ ...form, company: e.target.value }))} placeholder="소속" /><FloorPicker value={editForm.floor} onChange={(floor) => setEditForm((form) => ({ ...form, floor }))} label="���업층 선택" /><Input aria-label="전화번호" value={editForm.phone} onChange={(e) => setEditForm((form) => ({ ...form, phone: e.target.value }))} placeholder="전화번호" /><label className="grid gap-2 text-sm font-medium">상태<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={editForm.status} onChange={(e) => setEditForm((form) => ({ ...form, status: e.target.value as Visitor["status"] }))}><option value="pending">승인 대기</option><option value="onsite">재실</option><option value="exited">퇴실</option></select></label><Input aria-label="담당자 성함" value={editForm.contact_name} onChange={(e) => setEditForm((form) => ({ ...form, contact_name: e.target.value }))} placeholder="담당자 성함" /><Input aria-label="담당자 소속" value={editForm.contact_company} onChange={(e) => setEditForm((form) => ({ ...form, contact_company: e.target.value }))} placeholder="담당자 소속" /></div><DialogFooter><Button variant="outline" onClick={() => setEditVisitor(null)}>취소</Button><Button onClick={handleSaveEdit} disabled={savingEdit}>{savingEdit ? "저장 중..." : "저장"}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={floorVisitor !== null} onOpenChange={(open) => !open && setFloorVisitor(null)}><DialogContent><DialogHeader><DialogTitle>{floorVisitor ? `${floorVisitor.name} · 작업층` : "작업층"}</DialogTitle></DialogHeader>{floorVisitor && <FloorBadges value={floorVisitor.floor ?? ""} />}</DialogContent></Dialog>

      <Dialog open={chatWith !== null} onOpenChange={(open) => !open && setChatWith(null)}>
        <DialogContent className="flex max-h-[80vh] flex-col gap-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {chatWith ? `${chatWith.name} · ${chatWith.floor}` : "채팅"}
            </DialogTitle>
          </DialogHeader>
          {chatWith && (
            <ChatPanel 
              visitorId={chatWith.id} 
              viewpoint="admin" 
              className="h-96"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={memoVisitor !== null} onOpenChange={(open) => !open && setMemoVisitor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {memoVisitor ? `${memoVisitor.name} (${memoVisitor.company}) 메모` : "관리자 메모"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="특이사항이나 전달받은 메모 내용을 입력하세요..."
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setMemoVisitor(null)}>
              취소
            </Button>
            <Button onClick={handleSaveMemo} disabled={savingMemo}>
              {savingMemo ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
