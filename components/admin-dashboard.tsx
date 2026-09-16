"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { toast } from "sonner"
import { Building2, ChevronDown, Download, LogOut, RefreshCw, Search, Users, UserCheck, X, Megaphone } from "lucide-react"
import { VisitorTable } from "./visitor-table"
import { DeletedVisitorsTable } from "./deleted-visitors-table"
import { StatCards } from "./stat-cards"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getLocalDateString, getTodayString } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { Visitor } from "@/lib/types"
import { FloorBadges, parseFloors, sortFloors } from "@/components/floor-picker"

export function AdminDashboard() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString())
  const [expandDeleted, setExpandDeleted] = useState(false)
  const [showOnlyOnsite, setShowOnlyOnsite] = useState(false)
  const [portalSearchMode, setPortalSearchMode] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcementText, setAnnouncementText] = useState("")
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false)
  const [floorsOpen, setFloorsOpen] = useState(false)

  const [visitorsData, setVisitorsData] = useState<Visitor[]>([])
  const [deletedVisitorsData, setDeletedVisitorsData] = useState<Visitor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const todayStr = getTodayString()
  const isFutureDate = selectedDate > todayStr

  const isSelectedDateTodayRef = useRef(true)

  useEffect(() => {
    isSelectedDateTodayRef.current = selectedDate === getTodayString()
  }, [selectedDate])

  const fetchVisitors = async () => {
    setError(null)
    try {
      // 선택일의 KST 하루 범위만 조회하고, 선택일 이전에 입실해 아직 재실 중인 행은 함께 가져옵니다.
      const dayStart = new Date(`${selectedDate}T00:00:00+09:00`)
      const dayEnd = new Date(`${selectedDate}T00:00:00+09:00`)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)
      const startIso = dayStart.toISOString()
      const endIso = dayEnd.toISOString()

      const { data: active, error: activeErr } = await supabase
        .from("visitors")
        .select("*")
        .neq("status", "deleted")
        .or(`and(registered_at.gte.${startIso},registered_at.lt.${endIso}),and(status.eq.onsite,entered_at.lt.${endIso}),and(status.eq.exited,exited_at.gte.${startIso},exited_at.lt.${endIso}),and(status.eq.exited,entered_at.lt.${endIso},exited_at.gte.${endIso})`)
        .order("registered_at", { ascending: false })

      if (activeErr) throw activeErr

      const { data: deleted, error: deletedErr } = await supabase
        .from("visitors")
        .select("*")
        .eq("status", "deleted")
        .gte("deleted_at", startIso)
        .lt("deleted_at", endIso)
        .order("registered_at", { ascending: false })

      if (deletedErr) throw deletedErr

      setVisitorsData(active || [])
      setDeletedVisitorsData(deleted || [])
    } catch (err: any) {
      console.error("[Supabase Fetch Error]:", err)
      setError("데이터를 불러오지 못했습니다. 환경 변수나 DB 설정을 확인해주세요.")
    } finally {
      setIsLoading(false)
    }
  }

  // 초기 로드 및 Supabase 실시간(Realtime) 구독 설정
  useEffect(() => {
    fetchVisitors()

    // Realtime 채널 설정 (새로운 신청이나 상태 변경 시 자동 갱신)
    const channel = supabase
      .channel("visitors-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "visitors",
        },
        () => {
          fetchVisitors()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, selectedDate])

  useEffect(() => {
    let timerId: NodeJS.Timeout

    const scheduleMidnightUpdate = () => {
      const now = new Date()
      const kstOffset = 9 * 60 * 60 * 1000
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const kstNow = new Date(utc + kstOffset)

      const nextMidnightKST = new Date(kstNow)
      nextMidnightKST.setHours(24, 0, 0, 50)

      const msToMidnight = nextMidnightKST.getTime() - kstNow.getTime()

      timerId = setTimeout(() => {
        const newToday = getTodayString()

        if (isSelectedDateTodayRef.current) {
          setSelectedDate(newToday)
        }

        fetchVisitors()
        scheduleMidnightUpdate()
      }, msToMidnight)
    }

    scheduleMidnightUpdate()

    return () => {
      if (timerId) clearTimeout(timerId)
    }
  }, [])

  const activeVisitors = visitorsData
  const deletedVisitors = deletedVisitorsData.filter((visitor) => {
    const deletedDate = getLocalDateString(visitor.deletedAt || visitor.deleted_at)
    const registeredDate = getLocalDateString(visitor.registeredAt || visitor.registered_at)
    return deletedDate === selectedDate || (deletedDate === "" && registeredDate === selectedDate)
  })

  const matchesSelectedDate = (v: Visitor) => {
    const regDate = getLocalDateString(v.registeredAt || v.registered_at)
    const enteredDate = getLocalDateString(v.enteredAt || v.entered_at)
    const exitedDate = getLocalDateString(v.exitedAt || v.exited_at)

    return (
      regDate === selectedDate ||
      (v.status === "onsite" && enteredDate !== "" && enteredDate < selectedDate) ||
      (v.status === "exited" && enteredDate !== "" && enteredDate <= selectedDate && exitedDate > selectedDate) ||
      (v.status === "exited" && exitedDate === selectedDate)
    )
  }

  const dateScopedVisitors = activeVisitors.filter(matchesSelectedDate)
  const filtered = dateScopedVisitors.filter((v) => {
    const query = searchQuery.toLowerCase()
    return (
      (v.name ?? "").toLowerCase().includes(query) ||
      (v.phone ?? "").includes(query) ||
      (v.company ?? "").toLowerCase().includes(query)
    )
  })

  const processedVisitors = useMemo(() => {
    if (isFutureDate) return []

    return filtered
      .filter((v) => {
        const regDate = getLocalDateString(v.registeredAt || v.registered_at)
        const enteredDate = getLocalDateString(v.enteredAt || v.entered_at)

        const isRegisteredOnSelectedDate = regDate === selectedDate

        const isUnexitedFromPreviousDay =
          v.status === "onsite" &&
          enteredDate !== "" &&
          enteredDate < selectedDate

        const exitedDate = getLocalDateString(v.exitedAt || v.exited_at)
        const isExitedAfterSelectedDate =
          v.status === "exited" &&
          enteredDate !== "" &&
          enteredDate <= selectedDate &&
          exitedDate > selectedDate

        const isExitedOnSelectedDate =
          v.status === "exited" && exitedDate === selectedDate

        return isRegisteredOnSelectedDate || isUnexitedFromPreviousDay || isExitedAfterSelectedDate || isExitedOnSelectedDate
      })
      .map((v) => {
        const enteredDate = getLocalDateString(v.enteredAt || v.entered_at)
        const exitedDate = getLocalDateString(v.exitedAt || v.exited_at)
        const rawEnteredAt = v.enteredAt || v.entered_at
        const rawExitedAt = v.exitedAt || v.exited_at

        let displayEnteredAt = "-"
        let displayExitedAt = "-"

        if (rawEnteredAt) {
          try {
            const timeStr = new Date(rawEnteredAt).toLocaleTimeString("ko-KR", {
              timeZone: "Asia/Seoul",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })

            if (enteredDate !== "" && enteredDate < selectedDate) {
              displayEnteredAt = `[전날 입실] ${timeStr}`
            } else {
              displayEnteredAt = timeStr
            }
          } catch {
            displayEnteredAt = rawEnteredAt
          }
        }

        if (v.status === "onsite") {
          // 선택일에 입실한 오늘 방문자는 명일인계가 아니며, 과거 KST 입실자만 인계 표시합니다.
          displayExitedAt = enteredDate !== "" && enteredDate < selectedDate ? "명일인계" : "-"
        } else if (v.status === "exited" && rawExitedAt) {
          if (enteredDate !== "" && enteredDate < selectedDate && exitedDate > selectedDate) {
            displayExitedAt = "명일인계"
          } else {
            try {
              displayExitedAt = new Date(rawExitedAt).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })
            } catch {
              displayExitedAt = rawExitedAt
            }
          }
        }

        return {
          ...v,
          displayEnteredAt,
          displayExitedAt,
        }
      })
  }, [filtered, selectedDate, isFutureDate])

  const visitors = useMemo(() => {
    if (showOnlyOnsite) {
      return processedVisitors.filter((v) => v.status === "onsite")
    }
    return processedVisitors
  }, [processedVisitors, showOnlyOnsite])

  const onsiteCount = processedVisitors.filter((v) => v.status === "onsite").length

  async function sendAnnouncement() {
    const message = announcementText.trim()
    const onsiteVisitors = visitorsData.filter((visitor) => visitor.status === "onsite")

    if (!message) {
      toast.error("공지 내용을 입력해주세요.")
      return
    }
    if (onsiteVisitors.length === 0) {
      toast.info("현재 재실 중인 공사자가 없습니다.")
      return
    }

    setSendingAnnouncement(true)
    try {
      const { error } = await supabase.from("chat_messages").insert(
        onsiteVisitors.map((visitor) => ({
          visitor_id: visitor.id,
          sender: "admin",
          text: `[공지] ${message}`,
          is_read: false,
        })),
      )
      if (error) throw error

      toast.success(`${onsiteVisitors.length}명에게 공지를 전송했습니다.`)
      setAnnouncementText("")
      setAnnouncementOpen(false)
    } catch (error) {
      console.error("[v0] Announcement send error:", error)
      toast.error("공지 전송에 실패했습니다.")
    } finally {
      setSendingAnnouncement(false)
    }
  }

  function downloadExcel() {
    try {
      if (!activeVisitors || activeVisitors.length === 0) {
        toast.error("다운로드할 방문자 데이터가 없습니다.")
        return
      }

      const targetYearMonth = selectedDate.substring(0, 7)

      const monthVisitors = activeVisitors.filter((v) => {
        const regDate = getLocalDateString(v.registeredAt || v.registered_at)
        return regDate.startsWith(targetYearMonth)
      })

      if (monthVisitors.length === 0) {
        toast.error("선택한 월의 방문자 데이터가 없습니다.")
        return
      }

      const headers = ["이름", "소속", "작업층", "생년월일", "전화번호", "등록시간", "입실시간", "퇴실시간", "상태", "메모"]
      const rows = monthVisitors.map((v) => [
        v.name || "",
        v.company || "",
        v.floor || "",
        v.birth || "",
        v.phone || "",
        v.registeredAt || v.registered_at ? new Date(v.registeredAt || v.registered_at!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-",
        v.enteredAt || v.entered_at ? new Date(v.enteredAt || v.entered_at!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-",
        v.exitedAt || v.exited_at ? new Date(v.exitedAt || v.exited_at!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-",
        v.status === "pending" ? "승인 대기" : v.status === "onsite" ? "재실 중" : "퇴실",
        v.memo || "",
      ])

      const BOM = "\uFEFF"
      const csv = BOM + [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)

      link.setAttribute("href", url)
      link.setAttribute("download", `방문자현황_${targetYearMonth}.csv`)
      link.style.visibility = "hidden"

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success("엑셀 파일이 다운로드되었습니다.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드에 실패했습니다."
      toast.error(message)
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      localStorage.clear()
      sessionStorage.clear()
      
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
      })
    } catch (e) {
      console.error(e)
    }

    toast.success("로그아웃되었습니다.")
    window.location.replace(window.location.href)
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <div className="mx-auto w-full px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Building2 className="size-6" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight">방문 공사자 관리</h1>
              <p className="text-sm text-muted-foreground">실시간 출입 현황 대시보드</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFloorsOpen(true)}>현재 작업 중인 모든 층 확인</Button>
            <Button variant="outline" size="sm" onClick={() => setAnnouncementOpen(true)}><Megaphone className="size-4" />재실자 공지</Button>
            <Button variant={portalSearchMode ? "default" : "outline"} size="sm" className="hidden lg:inline-flex" onClick={() => setPortalSearchMode((enabled) => !enabled)} aria-pressed={portalSearchMode}>
              사내포털 검색모드 {portalSearchMode ? "ON" : "OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={fetchVisitors}>
              <RefreshCw className="size-4" />
              새로고침
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4" />
              로그아웃
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-6">
          <StatCards visitors={dateScopedVisitors} />

          <section className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-2">
                <label htmlFor="date" className="text-sm font-medium">
                  날짜 선택
                </label>
                <input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>

              <div className="flex flex-1 flex-wrap items-center justify-end gap-3 md:max-w-xl">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="이름, 전화번호, 회사명 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="검색 초기화"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <Button
                  variant={showOnlyOnsite ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyOnsite((prev) => !prev)}
                  className="gap-1.5 whitespace-nowrap"
                  disabled={isFutureDate}
                >
                  {showOnlyOnsite ? (
                    <>
                      <Users className="size-4" />
                      전체 보기
                    </>
                  ) : (
                    <>
                      <UserCheck className="size-4" />
                      재실 중만 보기 ({onsiteCount})
                    </>
                  )}
                </Button>

                <Button variant="outline" size="sm" onClick={downloadExcel}>
                  <Download className="size-4" />
                  엑셀 다운로드
                </Button>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : isLoading ? (
              <div className="rounded-xl border border-border py-16 text-center text-sm text-muted-foreground">
                불러오는 중...
              </div>
            ) : isFutureDate ? (
              <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                미래 날짜의 방문자 데이터는 존재하지 않습니다.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold">
                    {selectedDate === getTodayString()
                      ? showOnlyOnsite ? "오늘의 재실 인원" : "오늘의 방문자"
                      : showOnlyOnsite ? "선택된 날짜의 재실 인원" : "선택된 날짜의 방문자"}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {searchQuery ? `검색결과: ${visitors.length}명` : `총 ${visitors.length}명`}
                  </span>
                </div>
                <VisitorTable visitors={visitors} onMutate={fetchVisitors} portalSearchMode={portalSearchMode} />
              </>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <button
              onClick={() => setExpandDeleted(!expandDeleted)}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
            >
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ChevronDown
                  className={`size-4 transition-transform ${expandDeleted ? "rotate-180" : ""}`}
                />
                삭제된 인원 목록 ({deletedVisitors.length}명)
              </h3>
            </button>

            {expandDeleted && (
              <div className="flex flex-col gap-4">
                {deletedVisitors.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                    삭제된 인원이 없습니다.
                  </div>
                ) : (
                  <DeletedVisitorsTable visitors={deletedVisitors} onMutate={fetchVisitors} />
                )}
              </div>
            )}
          </section>
        </div>
        <Dialog open={floorsOpen} onOpenChange={setFloorsOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>현재 작업 중인 모든 층</DialogTitle><DialogDescription>재실 중인 공사자들이 선택한 작업층을 통합해 보여드립니다.</DialogDescription></DialogHeader><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex flex-wrap gap-2">{sortFloors(Array.from(new Set(visitorsData.filter((visitor) => visitor.status === "onsite").flatMap((visitor) => parseFloors(visitor.floor || ""))))).map((floor) => <span key={floor} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">{floor}</span>)}</div></div></DialogContent></Dialog>

        <Dialog open={announcementOpen} onOpenChange={setAnnouncementOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>재실 중인 공사자에게 공지</DialogTitle>
              <DialogDescription>
                현재 재실 중인 {visitorsData.filter((visitor) => visitor.status === "onsite").length}명에게 공지가 전송됩니다.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={announcementText}
              onChange={(event) => setAnnouncementText(event.target.value)}
              placeholder="공지 내용을 입력하세요."
              rows={5}
              maxLength={500}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAnnouncementOpen(false)} disabled={sendingAnnouncement}>
                취소
              </Button>
              <Button onClick={sendAnnouncement} disabled={sendingAnnouncement || !announcementText.trim()}>
                {sendingAnnouncement ? "전송 중..." : "공지 전송"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  )
}
