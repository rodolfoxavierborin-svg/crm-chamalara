// File: src/app/page.tsx

"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import KanbanBoard from '../components/KanbanBoard';
import TeamModal from '../components/modals/TeamModal';
import { parseDataSegura, getUltimaInteracao } from '../utils/dateUtils';

// FORMATADOR PADRÃO WHATSAPP LOCAL
const formatarHorario = (dataIso: string | null) => {
  if (!dataIso) return '';
  const ms = getUltimaInteracao({ ultima_interacao: dataIso });
  if (ms === 0) return '';

  const data = new Date(ms);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (data.toDateString() === hoje.toDateString()) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } 
  if (data.toDateString() === ontem.toDateString()) {
    return 'Ontem';
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// SEPARADOR DO CHAT
const formatDateSeparator = (dataIso: string | Date) => {
  const ms = dataIso instanceof Date ? dataIso.getTime() : getUltimaInteracao({ ultima_interacao: dataIso });
  const data = new Date(ms);
  
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);

  if (data.toDateString() === hoje.toDateString()) return 'Hoje';
  if (data.toDateString() === ontem.toDateString()) return 'Ontem';

  return data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

// HELPER PARA EXTRAIR MENSAGENS
const parseMensagem = (msg: any) => {
  let raw = msg.message || msg;
  let type = 'human';
  let content = '';

  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (e) { content = raw; }
  }

  if (typeof raw === 'object' && raw !== null) {
    type = raw.type || msg.type || 'human';
    content = raw.content || raw.data?.content || '';
    if (typeof content === 'object') {
      try { content = JSON.stringify(content); } catch (e) { content = ''; }
    }
  }

  return { type, content, isTool: type === 'tool' };
};

const isMensagemTecnica = (msg: any): boolean => {
  const { content, isTool } = parseMensagem(msg);
  if (isTool) return true;
  if (!content || typeof content !== 'string') return false;
  const t = content.trim();
  if (t.startsWith('Calling ') || t.includes('with input:')) return true;
  if (t.includes('Confirmar_Agendamento') || t.includes('Create_an_event') || t.includes('Call_Sub-workflow')) return true;
  return false;
};

export default function HomePage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'kanban'>('chat');
  const [leads, setLeads] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Controle do Modal de Equipe
  const [showTeamModal, setShowTeamModal] = useState(false);

  // AUTENTICAÇÃO REAL DO SUPABASE
  useEffect(() => {
    const checkUser = async () => {
      try {
        setLoadingAuth(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          router.push('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('dentup_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        setUserProfile(profile || {
          id: session.user.id,
          nome: session.user.email,
          email: session.user.email,
          cargo: 'admin',
          unidade: 'Todas'
        });
      } catch (err) {
        console.error('Erro de autenticação:', err);
      } finally {
        setLoadingAuth(false);
      }
    };

    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  // BUSCA DE LEADS E MENSAGENS PARA O CHAT
  useEffect(() => {
    if (loadingAuth) return;

    const fetchLeads = async () => {
      const { data, error } = await supabase.from('dentup_leads').select('*');
      if (!error) {
        const leadsData = data || [];
        setLeads(leadsData);
        if (leadsData.length > 0 && !selectedLead) {
          setSelectedLead([...leadsData].sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a))[0]);
        }
      }
    };
    fetchLeads();

    const leadsChannel = supabase
      .channel('leads-global-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, (payload: any) => {
        const newLead = payload.new as any;
        if (!newLead || !newLead.id) return;
        
        setLeads((curr) => {
          const existingLead = curr.find((l) => l.id === newLead.id);
          if (existingLead) {
            const localTime = getUltimaInteracao(existingLead);
            const dbTime = getUltimaInteracao(newLead);
            
            if (localTime > dbTime) {
              newLead.ultima_interacao = existingLead.ultima_interacao;
              newLead['última_interação'] = existingLead['última_interação'];
            }
            return curr.map((l) => (l.id === newLead.id ? newLead : l));
          }
          return [...curr, newLead];
        });
        
        setSelectedLead((prev: any) => (prev?.id === newLead.id ? { ...prev, ...newLead } : prev));
      })
      .subscribe();

    const globalMessagesChannel = supabase
      .channel('global-messages-sidebar-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
        const newMsg = payload.new;
        if (!newMsg || !newMsg.session_id) return;
        if (isMensagemTecnica(newMsg)) return;

        const cleanPhoneFromSession = newMsg.session_id.replace('dentup_', '');

        setLeads((currLeads) => {
          return currLeads.map((lead) => {
            const leadPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
            if (leadPhone === cleanPhoneFromSession) {
              const msgDate = newMsg.created_at || new Date().toISOString();
              return {
                ...lead,
                ultima_interacao: msgDate,
                'última_interação': msgDate
              };
            }
            return lead;
          });
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(globalMessagesChannel);
    };
  }, [loadingAuth]);

  useEffect(() => {
    if (!selectedLead || loadingAuth) return;
    const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
    if (!cleanPhone) { setMessages([]); return; }

    const targetSessionId = `dentup_${cleanPhone}`;

    const fetchMessages = async () => {
      const { data, error } = await supabase.from('dentup_messages').select('*').eq('session_id', targetSessionId).order('created_at', { ascending: true });
      if (!error) setMessages(data || []);
    };
    fetchMessages();

    const messagesChannel = supabase
      .channel(`chat_messages_realtime_${cleanPhone}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
          const newMsg = payload.new;
          if (newMsg && newMsg.session_id === targetSessionId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              const tempIndex = prev.findIndex((m) => m.id.toString().startsWith('temp-'));
              if (tempIndex !== -1) {
                const updated = [...prev];
                updated[tempIndex] = newMsg;
                return updated;
              }
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(messagesChannel); };
  }, [selectedLead?.id, selectedLead?.phone, selectedLead?.phone_number, loadingAuth]);

  useEffect(() => {
    setTimeout(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, 100);
  }, [messages]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const togglePauseAI = async () => {
    if (!selectedLead) return;
    const newStatus = !selectedLead.is_paused;
    const updatedLead = { ...selectedLead, is_paused: newStatus };
    setSelectedLead(updatedLead);
    setLeads((prev: any[]) => prev.map((l) => (l.id === selectedLead.id ? updatedLead : l)));
    await supabase.from('dentup_leads').update({ is_paused: newStatus }).eq('id', selectedLead.id);
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || !selectedLead) return;
    const messageText = newMessage;
    setNewMessage('');
    const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
    const targetSessionId = `dentup_${cleanPhone}`;
    const optimisticMessage = {
      id: `temp-${Date.now()}`,
      session_id: targetSessionId,
      created_at: new Date().toISOString(),
      message: { type: 'human_agent', content: messageText }
    };

    setMessages((prev: any[]) => [...prev, optimisticMessage]);

    try {
      if (!selectedLead.is_paused) {
        const leadPausado = { ...selectedLead, is_paused: true };
        setSelectedLead(leadPausado);
        setLeads((prev: any[]) => prev.map((l) => (l.id === selectedLead.id ? leadPausado : l)));
        await supabase.from('dentup_leads').update({ is_paused: true }).eq('id', selectedLead.id);
      }
      const { data: insertedMessage, error } = await supabase
        .from('dentup_messages').insert({ session_id: targetSessionId, message: { type: 'human_agent', content: messageText } }).select().single();

      if (!error) {
        setMessages((prev: any[]) => prev.map((msg) => (msg.id === optimisticMessage.id ? insertedMessage : msg)));
      }

      fetch('https://api.rodolfoxborin.com.br/webhook/crm-envio-humano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: cleanPhone, content: messageText, session_id: targetSessionId })
      }).catch((err) => console.error(err));
    } catch (error) {
      console.error(error);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-semibold text-slate-500">Carregando ambiente seguro...</p>
        </div>
      </div>
    );
  }

  const cargoNorm = userProfile?.cargo?.toLowerCase()?.trim() || '';
  const isAdmin = cargoNorm === 'admin' || cargoNorm === 'administrador' || cargoNorm === 'administrador geral';
  const userUnidade = userProfile?.unidade || 'Todas';

  const sortedLeads = [...leads]
    .filter((lead) => {
      if (isAdmin || !userUnidade || userUnidade === 'Todas') return true;
      const leadUnidade = lead.unidade || lead.unit || 'Sem Unidade';
      return leadUnidade.toLowerCase() === userUnidade.toLowerCase();
    })
    .sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  let lastDateGroup = '';

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans notranslate" translate="no">
      
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 h-14 md:h-16 shrink-0 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Dent'up Odonto" className="h-8 md:h-10 w-auto object-contain" />
          <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="text-sm md:text-base font-bold text-slate-800 notranslate hidden sm:block" translate="no">
            CRM <span className="text-slate-400 font-medium">Clínica</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
          {isAdmin && (
            <button
              onClick={() => setShowTeamModal(true)}
              className="hidden md:flex bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-md text-xs font-bold transition-all items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Gerenciar Equipe</span>
            </button>
          )}

          <div className="hidden md:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button onClick={() => setAbaAtiva('chat')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate cursor-pointer ${abaAtiva === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Chat (Mensagens)
            </button>
            <button onClick={() => setAbaAtiva('kanban')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate cursor-pointer ${abaAtiva === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Quadro CRM
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3 border-l border-slate-200 pl-3 md:pl-4">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-800 notranslate">{userProfile?.nome || userProfile?.email || 'Usuário'}</p>
              <div className="flex items-center justify-end gap-1">
                <span className="text-[9px] md:text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">{userProfile?.cargo || 'Atendente'}</span>
                {userUnidade !== 'Todas' && (
                  <span className="text-[9px] md:text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">{userUnidade}</span>
                )}
              </div>
            </div>
            <button onClick={handleLogout} title="Encerrar Sessão" className="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 cursor-pointer">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard userProfile={userProfile} onSelectLead={(lead) => { setSelectedLead(lead); setAbaAtiva('chat'); }} />
        ) : (
          <div className="flex h-full w-full bg-white border-x border-slate-200">
            
            {/* SIDEBAR DE CONVERSAS */}
            <div className={`w-full md:w-[380px] border-r border-slate-200 bg-white flex flex-col ${selectedLead ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center h-[52px] md:h-[56px] shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm md:text-base font-bold text-slate-800 notranslate">Mensagens</h2>
                  {!isAdmin && userUnidade !== 'Todas' && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">{userUnidade}</span>
                  )}
                </div>
                <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full">{sortedLeads.length}</span>
              </div>
              <ul className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                {sortedLeads.map((lead) => {
                  const ultimaInteracao = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
                  const isSelected = selectedLead?.id === lead.id;
                  const photo = lead.avatar_url || lead.photo_url || lead.profile_pic;

                  return (
                    <li key={lead.id} onClick={() => setSelectedLead(lead)}
                      className={`cursor-pointer p-3 transition-all border-b border-slate-100 flex gap-3 items-center ${
                        isSelected ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      {photo ? (
                        <img src={photo} alt={lead.name || 'Paciente'} className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-base shrink-0">
                          {lead.name ? lead.name.charAt(0).toUpperCase() : 'P'}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className={`font-semibold text-sm truncate ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>{lead.name || 'Sem Nome'}</p>
                          <span className={`text-[11px] whitespace-nowrap ml-2 font-bold ${formatarHorario(ultimaInteracao) === 'Ontem' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {formatarHorario(ultimaInteracao)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-slate-500 truncate">{lead.phone || lead.phone_number}</p>
                          {lead.is_paused && <span className="bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ml-2 shrink-0 notranslate">Humano</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ÁREA DO CHAT */}
            <div className={`flex-1 flex-col bg-[#EFEAE2] relative ${selectedLead ? 'flex' : 'hidden md:flex'}`}>
              <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}></div>

              {selectedLead ? (
                <>
                  <div className="bg-slate-50 border-b border-slate-200 px-4 h-[52px] md:h-[56px] shrink-0 flex justify-between items-center z-10">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setSelectedLead(null)} className="md:hidden text-slate-500 pr-1">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                      </button>

                      {selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic ? (
                        <img src={selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic} alt={selectedLead.name} className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover shadow-sm" />
                      ) : (
                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm md:text-base">
                          {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : 'P'}
                        </div>
                      )}

                      <div>
                        <h2 className="text-xs md:text-sm font-bold text-slate-800">{selectedLead.name || 'Sem Nome'}</h2>
                        <span className="text-[11px] md:text-xs text-slate-500">{selectedLead.phone || selectedLead.phone_number}</span>
                      </div>
                    </div>

                    <button onClick={togglePauseAI} className={`px-3 py-1 md:px-4 md:py-1.5 rounded-lg font-bold text-xs transition-all border shadow-sm notranslate cursor-pointer ${
                        selectedLead.is_paused 
                          ? 'bg-red-500 text-white border-red-600 hover:bg-red-600' 
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {selectedLead.is_paused ? '▶ Retomar IA' : '⏸️ Assumir Chat'}
                    </button>
                  </div>

                  {/* MENSAGENS */}
                  <div className="flex-1 overflow-y-auto p-3 md:p-4 relative z-10 custom-scrollbar">
                    <div className="flex flex-col space-y-3 pb-4">
                      {messages.map((msg) => {
                        if (isMensagemTecnica(msg)) return null;
                        
                        const msSeguro = parseDataSegura(msg.created_at) || Date.now();
                        const msgDate = new Date(msSeguro);
                        
                        const currentDateGroup = msgDate.toLocaleDateString('pt-BR');
                        const isNewDate = currentDateGroup !== lastDateGroup;
                        
                        if (isNewDate) lastDateGroup = currentDateGroup;

                        const { type, content } = parseMensagem(msg);
                        const isPatient = type === 'human' || type === 'user';
                        const isAI = type === 'ai' || type === 'assistant';
                        const baloes = (content || '').split('###').map((t: string) => t.trim()).filter((t: string) => t.length > 0);

                        return (
                          <React.Fragment key={msg.id}>
                            {isNewDate && (
                              <div className="flex justify-center my-4 opacity-90">
                                <span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-[11px] font-bold px-3 py-1 rounded-lg shadow-sm uppercase tracking-wide">
                                  {formatDateSeparator(msgDate)}
                                </span>
                              </div>
                            )}

                            {baloes.map((texto: string, index: number) => {
                              return (
                                <div key={`${msg.id}-${index}`} className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}>
                                  <div className={`max-w-[85%] md:max-w-md rounded-2xl p-3 shadow-sm relative ${
                                      isPatient ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100/80' : 'bg-[#D9FDD3] text-slate-800 rounded-tr-none'
                                    }`}
                                  >
                                    <span className={`block text-[11px] font-bold mb-1 notranslate ${
                                      isPatient ? 'text-slate-400' : isAI ? 'text-emerald-700' : 'text-emerald-800'
                                    }`}>
                                      {isPatient ? 'Paciente' : isAI ? 'Lara (IA)' : 'Você (Atendente)'}
                                    </span>
                                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{texto}</p>
                                    <span className="block text-[10px] text-right mt-1.5 text-slate-400" title={msgDate.toLocaleString('pt-BR')}>
                                      {msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  <div className="p-2.5 md:p-3 bg-slate-50 h-[58px] md:h-[64px] shrink-0 flex items-center z-10 border-t border-slate-200">
                    <div className="flex items-center space-x-2 w-full max-w-5xl mx-auto">
                      <div className="flex-1 bg-white rounded-full p-1 md:p-1.5 flex items-center shadow-sm border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <input
                          type="text" placeholder="Digite uma mensagem..."
                          className="flex-1 bg-transparent px-3 py-1 text-sm text-slate-800 outline-none"
                          value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                      </div>
                      <button onClick={handleSendMessage} className="bg-[#00A884] text-white w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#008f70] transition-colors shadow-sm shrink-0 cursor-pointer">
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center bg-[#EFEAE2] z-10">
                  <div className="text-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <img src="/logo.png" alt="Dent'up Odonto" className="h-14 w-auto mx-auto mb-3 object-contain" />
                    <h3 className="text-lg font-bold text-slate-800 mb-1 notranslate">Dent'up Inbox</h3>
                    <p className="text-sm text-slate-500">Selecione uma conversa à esquerda<br/>para iniciar o atendimento.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* COMPONENTE ISOLADO DO MODAL DE EQUIPE */}
      <TeamModal isOpen={showTeamModal} onClose={() => setShowTeamModal(false)} />

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}} />
    </div>
  );
}