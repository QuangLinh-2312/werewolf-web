'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { CheckCircle, Loader2, Heart, Moon, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useGame } from '@/contexts/GameContext'
import { createClient } from '@/lib/supabase/client'
import { getRoleDefinition } from '@/lib/game/roles'
import type { GamePlayerWithProfile } from '@/contexts/GameContext'
import type { NightAction } from '@/types/database.types'

export function NightActionPanel() {
  const { session, me, players, activeActions, submitAction } = useGame()
  const [submitting, setSubmitting] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const historyLoadedRef = useRef(false)

  const [seerResult, setSeerResult] = useState<string | null>(null)
  const [checkingRole, setCheckingRole] = useState(false)
  const [lastProtectedId, setLastProtectedId] = useState<string | null>(null)
  const [usedSave, setUsedSave] = useState(false)
  const [usedToxic, setUsedToxic] = useState(false)
  const [witchStep, setWitchStep] = useState<'decision' | 'toxic_target' | 'done'>('decision')
  const [selectedLovers, setSelectedLovers] = useState<string[]>([])
  const [wolfVictim, setWolfVictim] = useState<{ profileId: string; nickname: string } | null>(null)
  const [alphaCheckResult, setAlphaCheckResult] = useState<string | null>(null)
  const [detectiveResult, setDetectiveResult] = useState<string | null>(null)

  const supabaseRef = useRef(createClient())
  const roleDef = me ? getRoleDefinition(me.role) : null

  const fetchSeerResult = useCallback(async (targetProfileId: string) => {
    if (!session) return
    setCheckingRole(true)
    try {
      const { data, error } = await (supabaseRef.current.rpc as any)('check_player_role', {
        p_session_id: session.id,
        p_target_profile_id: targetProfileId,
      })
      if (error) throw error
      setSeerResult(data === 'wolf' ? 'MA SÓI 🐺' : 'KHÔNG PHẢI SÓI 👤')
    } catch {
      toast.error('Không thể kiểm tra vai trò')
    } finally {
      setCheckingRole(false)
    }
  }, [session?.id])

  useEffect(() => {
    if (!session || !me || !me.is_alive) return
    historyLoadedRef.current = false
    setLoadingHistory(true)
    setWitchStep('decision')
    setUsedSave(false)
    setUsedToxic(false)
    setSeerResult(null)
    setLastProtectedId(null)
    setAlphaCheckResult(null)
    setDetectiveResult(null)

    const loadHistory = async () => {
      try {
        const { data, error } = await supabaseRef.current
          .from('night_actions').select('*')
          .eq('session_id', session.id).eq('actor_id', me.id)
        if (error) throw error
        const actions = (data as NightAction[]) ?? []

        if (me.role === 'witch') {
          setUsedSave(actions.some((a) => a.action_type === 'save'))
          setUsedToxic(actions.some((a) => a.action_type === 'toxic'))
          const saveAction = actions.find((a) => a.action_type === 'save' && a.day_number === session.day_number)
          const toxicAction = actions.find((a) => a.action_type === 'toxic' && a.day_number === session.day_number)
          if (saveAction) setWitchStep(toxicAction ? 'done' : 'toxic_target')
        }
        if (me.role === 'guard') {
          const prevProtect = actions.find((a) => a.action_type === 'protect' && a.day_number === session.day_number - 1)
          if (prevProtect?.target_id) setLastProtectedId(prevProtect.target_id)
        }
        if (me.role === 'seer') {
          const check = actions.find((a) => a.action_type === 'check' && a.day_number === session.day_number && a.target_id)
          if (check?.target_id) {
            const { data: pData } = await supabaseRef.current.from('game_players').select('profile_id').eq('id', check.target_id).single()
            if (pData) fetchSeerResult((pData as { profile_id: string }).profile_id)
          }
        }
        historyLoadedRef.current = true
      } catch (e) { console.error('Lỗi tải lịch sử đêm:', e) }
      finally { setLoadingHistory(false) }
    }
    loadHistory()
  }, [session?.day_number, session?.id, me?.id, me?.role, fetchSeerResult])

  useEffect(() => {
    if (!session || me?.role !== 'witch' || !me.is_alive) return
    const loadVictim = async () => {
      try {
        const { data, error } = await (supabaseRef.current.rpc as any)('get_wolf_kill_target', { p_session_id: session.id })
        if (error) throw error
        const row = (data as { target_profile_id: string; target_nickname: string }[])?.[0]
        setWolfVictim(row?.target_profile_id ? { profileId: row.target_profile_id, nickname: row.target_nickname } : null)
      } catch { setWolfVictim(null) }
    }
    loadVictim()
    const interval = setInterval(loadVictim, 4000)
    return () => clearInterval(interval)
  }, [session?.id, session?.day_number, me?.role, me?.is_alive])

  if (!session || !me || !me.is_alive || session.phase !== 'night_actions') return null

  const ACTIONABLE = ['wolf', 'seer', 'guard', 'witch', 'cupid', 'alpha_wolf', 'avenger_wolf', 'silencer', 'detective', 'doppelganger']
  const isCupidActive = me.role === 'cupid' && session.day_number === 1
  const isDoppelgangerActive = me.role === 'doppelganger' && session.day_number === 1

  if (!ACTIONABLE.includes(me.role) || (me.role === 'cupid' && !isCupidActive) || (me.role === 'doppelganger' && !isDoppelgangerActive)) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center glass rounded-2xl min-h-[180px] border border-white/5">
        <div className="text-4xl mb-3">💤</div>
        <h4 className="text-base font-bold text-white mb-2">Bạn đang ngủ...</h4>
        <p className="text-xs text-white/45 max-w-xs leading-relaxed">Vai trò của bạn không có hành động ban đêm. Chờ các vai đặc biệt hoàn thành.</p>
      </div>
    )
  }

  if (loadingHistory) {
    return (
      <div className="flex justify-center items-center p-8 glass rounded-2xl min-h-[180px]">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    )
  }

  const otherLivingPlayers = players.filter((p) => p.id !== me.id && p.is_alive)
  const myAction = activeActions.find((a) => a.actor_id === me.id)
  const myKillAction = activeActions.find((a) => a.actor_id === me.id && a.action_type === 'kill')
  const myAlphaCheckAction = activeActions.find((a) => a.actor_id === me.id && a.action_type === 'alpha_check')
  const hasDoneAction =
    (me.role === 'alpha_wolf' ? (!!myKillAction && !!myAlphaCheckAction) : !!myAction) ||
    (me.role === 'witch' && witchStep === 'done') ||
    (me.role === 'cupid' && !!myAction) ||
    (me.role === 'doppelganger' && !!myAction)
  const noTargets = otherLivingPlayers.length === 0

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleWolfAction = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try { await submitAction('kill', tgt.profile_id); toast.success(`Đã chọn cắn ${tgt.profiles?.nickname}`) }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Cắn thất bại') }
    finally { setSubmitting(false) }
  }

  const handleSeerAction = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try { await submitAction('check', tgt.profile_id); toast.success(`Đã soi ${tgt.profiles?.nickname}`); await fetchSeerResult(tgt.profile_id) }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Soi thất bại') }
    finally { setSubmitting(false) }
  }

  const handleGuardAction = async (tgt: GamePlayerWithProfile) => {
    if (tgt.id === lastProtectedId) { toast.error('Không bảo vệ cùng người 2 đêm liên tiếp!'); return }
    setSubmitting(true)
    try { await submitAction('protect', tgt.profile_id); toast.success(`Đã bảo vệ ${tgt.profiles?.nickname}`) }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Bảo vệ thất bại') }
    finally { setSubmitting(false) }
  }

  const handleWitchSave = async () => {
    if (usedSave || !wolfVictim) { toast.error('Không có ai bị cắn!'); return }
    setSubmitting(true)
    try { await submitAction('save', wolfVictim.profileId); toast.success(`Đã cứu ${wolfVictim.nickname}!`); setUsedSave(true); setWitchStep('toxic_target') }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Cứu thất bại') }
    finally { setSubmitting(false) }
  }
  const handleWitchSkipSave = async () => {
    setSubmitting(true)
    try { await submitAction('save', null); setWitchStep('toxic_target'); toast.info('Bỏ qua thuốc cứu') }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Lỗi') }
    finally { setSubmitting(false) }
  }
  const handleWitchToxic = async (tgt: GamePlayerWithProfile) => {
    if (usedToxic) return
    setSubmitting(true)
    try { await submitAction('toxic', tgt.profile_id); toast.success(`Đã đầu độc ${tgt.profiles?.nickname}`); setUsedToxic(true); setWitchStep('done') }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Đầu độc thất bại') }
    finally { setSubmitting(false) }
  }
  const handleWitchSkipToxic = async () => {
    setSubmitting(true)
    try { await submitAction('toxic', null); setWitchStep('done'); toast.info('Bỏ qua thuốc độc') }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Lỗi') }
    finally { setSubmitting(false) }
  }

  const toggleSelectLover = (profileId: string) => {
    setSelectedLovers((prev) => {
      if (prev.includes(profileId)) return prev.filter((id) => id !== profileId)
      if (prev.length >= 2) { toast.error('Chỉ chọn tối đa 2 người!'); return prev }
      return [...prev, profileId]
    })
  }
  const handleCupidAction = async () => {
    if (selectedLovers.length !== 2) { toast.error('Chọn đúng 2 người!'); return }
    setSubmitting(true)
    try {
      const { error } = await (supabaseRef.current.rpc as any)('match_lovers', { p_session_id: session.id, p_lover1_profile_id: selectedLovers[0], p_lover2_profile_id: selectedLovers[1] })
      if (error) throw error
      toast.success('Hai người đã được kết duyên!')
    }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Ghép đôi thất bại') }
    finally { setSubmitting(false) }
  }

  const handleAlphaWolfCheck = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try {
      const { data, error } = await (supabaseRef.current.rpc as any)('alpha_wolf_check', { p_session_id: session.id, p_target_profile_id: tgt.profile_id })
      if (error) throw error
      const label = ['wolf','alpha_wolf','avenger_wolf'].includes(data) ? `MA SÓI 🐺 (${data})` : `${data} 👤`
      setAlphaCheckResult(`${tgt.profiles?.nickname}: ${label}`)
      toast.success(`Đã soi ${tgt.profiles?.nickname}`)
    }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Soi thất bại') }
    finally { setSubmitting(false) }
  }

  const handleSilencerAction = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try {
      const { error } = await (supabaseRef.current.rpc as any)('silencer_silence', { p_session_id: session.id, p_target_profile_id: tgt.profile_id })
      if (error) throw error
      toast.success(`${tgt.profiles?.nickname} sẽ bị câm ngày mai`)
    }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Câm thất bại') }
    finally { setSubmitting(false) }
  }

  const handleDetectiveAction = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try {
      const { data, error } = await (supabaseRef.current.rpc as any)('detective_investigate', { p_session_id: session.id, p_target_profile_id: tgt.profile_id })
      if (error) throw error
      const teamLabel = data === 'wolves' ? 'PHE SÓI 🐺' : data === 'neutral' ? 'TRUNG LẬP 🃏' : 'PHE DÂN 👤'
      setDetectiveResult(`${tgt.profiles?.nickname}: ${teamLabel}`)
      toast.success(`Đã điều tra ${tgt.profiles?.nickname}`)
    }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Điều tra thất bại') }
    finally { setSubmitting(false) }
  }

  const handleDoppelgangerAction = async (tgt: GamePlayerWithProfile) => {
    setSubmitting(true)
    try {
      const { error } = await (supabaseRef.current.rpc as any)('doppelganger_mark', { p_session_id: session.id, p_target_profile_id: tgt.profile_id })
      if (error) throw error
      toast.success(`Đã đánh dấu ${tgt.profiles?.nickname} — khi họ chết bạn nhận vai của họ`)
    }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Đánh dấu thất bại') }
    finally { setSubmitting(false) }
  }

  // ── Player row helper ────────────────────────────────────────────────────────
  const renderRow = (tgt: GamePlayerWithProfile, label: string, onClick: () => void, btnClass: string, disabled = false) => {
    const nick = tgt.profiles?.nickname ?? 'Player'
    return (
      <div key={tgt.id} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 hover:border-white/15 transition-all">
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9 border border-white/10">
            <AvatarFallback className="bg-zinc-800 text-white text-xs">{nick[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-white">{nick}</span>
        </div>
        <Button size="sm" disabled={submitting || disabled} onClick={onClick} className={`font-semibold text-xs h-9 px-4 ${btnClass}`}>
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : label}
        </Button>
      </div>
    )
  }

  const resultBox = (label: string, value: string, color: string) => (
    <div className={`p-3 border rounded-xl mb-2 ${color}`}>
      <span className="text-[10px] text-white/40 uppercase tracking-widest block mb-0.5">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="glass rounded-2xl p-5 border-2 border-purple-500/25 bg-purple-950/10">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
        <Moon className="w-5 h-5 text-blue-400" />
        <div>
          <h3 className="font-bold text-white text-sm">Hành động ban đêm — {roleDef?.name} {roleDef?.emoji}</h3>
          <p className="text-[11px] text-white/45">{roleDef?.nightAbility}</p>
        </div>
      </div>

      {hasDoneAction ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle className="w-10 h-10 mb-2 text-green-500" />
          <h4 className="text-sm font-semibold text-white">Đã hoàn thành hành động đêm!</h4>
          {me.role === 'seer' && seerResult && resultBox('Kết quả soi', seerResult, 'bg-purple-950/30 border-purple-500/25')}
          {me.role === 'detective' && detectiveResult && resultBox('Kết quả điều tra', detectiveResult, 'bg-teal-950/30 border-teal-500/25')}
          {me.role === 'alpha_wolf' && alphaCheckResult && resultBox('Kết quả soi (Sói Tiên Tri)', alphaCheckResult, 'bg-red-950/30 border-red-500/20')}
          {checkingRole && <Loader2 className="w-5 h-5 animate-spin text-purple-400 mt-3" />}
          <p className="text-xs text-white/35 mt-3">Chờ hết thời gian ban đêm...</p>
        </div>
      ) : (
        <>
          {noTargets && !['witch','cupid','doppelganger'].includes(me.role) && (
            <div className="text-center py-6 text-white/40 text-sm">Không có người chơi nào còn sống để chọn.</div>
          )}

          {/* Wolf / Avenger Wolf */}
          {['wolf','avenger_wolf'].includes(me.role) && !noTargets && (
            <div className="space-y-2">
              <p className="text-xs text-red-300/70 mb-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {me.role === 'avenger_wolf' ? 'Chọn nạn nhân — khi bị treo cổ bạn sẽ kéo theo 1 người ngẫu nhiên' : 'Chọn 1 nạn nhân — nếu nhiều sói, mục tiêu được nhiều vote nhất sẽ chết'}
              </p>
              {otherLivingPlayers.map((tgt) => renderRow(tgt, '🐺 Cắn', () => handleWolfAction(tgt), 'bg-red-600 hover:bg-red-500 text-white'))}
            </div>
          )}

          {/* Seer */}
          {me.role === 'seer' && !noTargets && (
            <div className="space-y-2">
              {seerResult && resultBox('Kết quả soi đêm nay', seerResult, 'bg-purple-950/30 border-purple-500/25')}
              {otherLivingPlayers.map((tgt) => renderRow(tgt, '🔮 Soi', () => handleSeerAction(tgt), 'bg-purple-600 hover:bg-purple-500 text-white'))}
            </div>
          )}

          {/* Guard */}
          {me.role === 'guard' && (
            <div className="space-y-2">
              {players.filter((p) => p.is_alive).map((tgt) => {
                const isLast = tgt.id === lastProtectedId
                const nick = tgt.profiles?.nickname ?? 'Player'
                const isMe = tgt.profile_id === me.profile_id
                return (
                  <div key={tgt.id} className={`flex items-center justify-between p-3 rounded-xl border bg-white/5 ${isLast ? 'opacity-40 border-white/5' : 'border-white/10 hover:border-blue-500/30'}`}>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9"><AvatarFallback className="bg-zinc-800 text-white text-xs">{nick[0]?.toUpperCase()}</AvatarFallback></Avatar>
                      <span className="text-sm text-white">{nick}{isMe && ' (Bạn)'}</span>
                    </div>
                    <Button size="sm" disabled={submitting || isLast} onClick={() => handleGuardAction(tgt)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9">
                      {isLast ? 'Đêm trước' : '🛡️ Bảo vệ'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Witch */}
          {me.role === 'witch' && witchStep === 'decision' && (
            <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl">
              <Heart className="w-8 h-8 text-rose-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-white text-center mb-1">Thuốc cứu</h4>
              <p className="text-xs text-white/55 text-center mb-4">Nạn nhân bị Sói cắn: <strong className="text-rose-400">{wolfVictim?.nickname ?? 'Chưa có ai bị cắn'}</strong></p>
              <div className="flex gap-2 justify-center">
                <Button disabled={submitting || usedSave || !wolfVictim} onClick={handleWitchSave} className="bg-rose-600 hover:bg-rose-500 text-white text-xs">{usedSave ? 'Đã dùng cứu' : '💊 Cứu'}</Button>
                <Button variant="outline" onClick={handleWitchSkipSave} className="border-white/15 text-white/70 text-xs">Bỏ qua</Button>
              </div>
            </div>
          )}
          {me.role === 'witch' && witchStep === 'toxic_target' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-emerald-950/20 border border-emerald-500/15 p-2.5 rounded-xl">
                <span className="text-xs text-emerald-300">Bước 2: Dùng thuốc độc?</span>
                <Button onClick={handleWitchSkipToxic} variant="outline" className="border-white/15 text-white/70 h-7 text-xs">Không dùng độc</Button>
              </div>
              {otherLivingPlayers.map((tgt) => renderRow(tgt, usedToxic ? 'Hết độc' : '☠️ Độc', () => handleWitchToxic(tgt), 'bg-emerald-700 hover:bg-emerald-600 text-white', usedToxic))}
            </div>
          )}

          {/* Cupid */}
          {me.role === 'cupid' && (
            <div className="space-y-3">
              <p className="text-xs text-pink-300/70 text-center">Chọn 2 người ({selectedLovers.length}/2)</p>
              {players.map((tgt) => {
                const nick = tgt.profiles?.nickname ?? 'Player'
                const isChecked = selectedLovers.includes(tgt.profile_id)
                return (
                  <div key={tgt.id} onClick={() => toggleSelectLover(tgt.profile_id)} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${isChecked ? 'border-pink-500/50 bg-pink-950/15' : 'border-white/5 bg-white/5 hover:border-white/15'}`}>
                    <span className="text-sm text-white">{nick}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isChecked ? 'border-pink-400 bg-pink-500' : 'border-white/25'}`}>
                      {isChecked && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                )
              })}
              <Button disabled={submitting || selectedLovers.length !== 2} onClick={handleCupidAction} className="w-full bg-pink-600 hover:bg-pink-500 text-white font-semibold">
                <Heart className="w-4 h-4 mr-2" />Kết duyên ({selectedLovers.length}/2)
              </Button>
            </div>
          )}

          {/* Alpha Wolf: cắn + soi */}
          {me.role === 'alpha_wolf' && !noTargets && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs text-red-300/70 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Bước 1: Cắn nạn nhân (cùng bầy sói)</p>
                {otherLivingPlayers.map((tgt) => renderRow(tgt, '🐺 Cắn', () => handleWolfAction(tgt), 'bg-red-600 hover:bg-red-500 text-white'))}
              </div>
              <div className="space-y-2 border-t border-white/5 pt-3">
                <p className="text-xs text-purple-300/70 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Bước 2: Soi 1 người biết vai thật</p>
                {alphaCheckResult && resultBox('Kết quả soi', alphaCheckResult, 'bg-red-950/30 border-red-500/20')}
                {otherLivingPlayers.map((tgt) => renderRow(tgt, '🔮 Soi', () => handleAlphaWolfCheck(tgt), 'bg-purple-700 hover:bg-purple-600 text-white'))}
              </div>
            </div>
          )}

          {/* Silencer */}
          {me.role === 'silencer' && !noTargets && (
            <div className="space-y-2">
              <p className="text-xs text-slate-300/70 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Chọn 1 người — họ sẽ không thể chat công khai ngày mai</p>
              {otherLivingPlayers.map((tgt) => renderRow(tgt, '🔇 Câm', () => handleSilencerAction(tgt), 'bg-slate-600 hover:bg-slate-500 text-white'))}
            </div>
          )}

          {/* Detective */}
          {me.role === 'detective' && !noTargets && (
            <div className="space-y-2">
              <p className="text-xs text-teal-300/70 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Điều tra 1 người — biết họ thuộc phe nào (Sói / Dân / Trung lập)</p>
              {detectiveResult && resultBox('Kết quả điều tra', detectiveResult, 'bg-teal-950/30 border-teal-500/25')}
              {otherLivingPlayers.map((tgt) => renderRow(tgt, '🕵️ Điều tra', () => handleDetectiveAction(tgt), 'bg-teal-600 hover:bg-teal-500 text-white'))}
            </div>
          )}

          {/* Doppelganger */}
          {me.role === 'doppelganger' && (
            <div className="space-y-2">
              <p className="text-xs text-fuchsia-300/70 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Đêm 1: Đánh dấu 1 người — khi họ chết bạn sẽ nhận vai của họ</p>
              {players.filter((p) => p.id !== me.id).map((tgt) => renderRow(tgt, '🤡 Đánh dấu', () => handleDoppelgangerAction(tgt), 'bg-fuchsia-700 hover:bg-fuchsia-600 text-white'))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
