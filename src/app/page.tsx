"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import KanbanBoard from '../components/KanbanBoard';

const formatarHorario = (dataIso: string | null) => {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  const hoje = new Date();
  if (data.toDateString() === hoje.toDateString()) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getUltimaInteracao = (lead: any) => {
  const rawDate = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
  return rawDate ? new Date(rawDate).getTime() : 0;
};

const isMensagemTecnica = (texto: string): boolean => {
  if (!texto || typeof texto !== 'string') return true;
  const t = texto.trim();
  if (t.startsWith('[{') || t.startsWith('{"')) return true;
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

  // ESTADOS DA MODAL DE GERENCIAR EQUIPE
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [newMemberNome, setNewMemberNome] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPass, setNewMemberPass] = useState('');
  const [newMemberCargo, setNewMemberCargo] = useState('atendente');
  const [newMemberUnidade, setNewMemberUnidade] = useState('Todas');
  const [savingMember, setSavingMember] = useState(false);
  const [teamError, setTeamError] = useState('');
  const [teamSuccess, setTeamSuccess] = useState('');

  // 1. CHECAGEM DE AUTENTICAÇÃO E SESSÃO
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('dentup_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setUserProfile(profile || { nome: session.user.email, cargo: 'admin', unidade: 'Todas' });
      setLoadingAuth(false);
    };

    checkUser();
  }, [router]);

  // BUSCA LISTA DE EQUIPE QUANDO ABRE A MODAL
  const fetchTeamMembers = async () => {
    const { data, error } = await supabase.from('dentup_profiles').select('*').order('nome', { ascending: true });
    if (!error) setTeamMembers(data || []);
  };

  useEffect(() => {
    if (showTeamModal) {
      fetchTeamMembers();
    }
  }, [showTeamModal]);

  // CADASTRAR NOVO MEMBRO VIA API
  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError('');
    setTeamSuccess('');
    setSavingMember(true);

    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: newMemberNome,
          email: newMemberEmail,
          password: newMemberPass,
          cargo: newMemberCargo,
          unidade: newMemberUnidade,
        }),
      });

      const result = await res.json();

      if (!res.ok || result.error) {
        setTeamError(result.error || 'Erro ao cadastrar usuário.');
      } else {
        setTeamSuccess('Usuário cadastrado com sucesso!');
        setNewMemberNome('');
        setNewMemberEmail('');
        setNewMemberPass('');
        fetchTeamMembers();
      }
    } catch (err: any) {
      setTeamError('Ocorreu um erro na requisição.');
    } finally {
      setSavingMember(false);
    }
  };

  // 2. BUSCA DE LEADS E ESCUTA EM TEMPO REAL GLOBAL
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
        setLeads((curr: any[]) =>
          curr.find((l) => l.id === newLead.id)
            ? curr.map((l) => (l.id === newLead.id ? newLead : l))
            : [...curr, newLead]
        );
        setSelectedLead((prev: any) => (prev?.id === newLead.id ? newLead : prev));
      })
      .subscribe();

    const globalMessagesChannel = supabase
      .channel('global-messages-sidebar-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
        const newMsg = payload.new;
        if (!newMsg || !newMsg.session_id) return;

        const cleanPhoneFromSession = newMsg.session_id.replace('dentup_', '');

        setLeads((currLeads) => {
          return currLeads.map((lead) => {
            const leadPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
            if (leadPhone === cleanPhoneFromSession) {
              return {
                ...lead,
                ultima_interacao: newMsg.created_at || new Date().toISOString(),
                'última_interação': newMsg.created_at || new Date().toISOString()
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

  // 3. BUSCA E ESCUTA DE MENSAGENS EM TEMPO REAL
  useEffect(() => {
    if (!selectedLead || loadingAuth) return;

    const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
    if (!cleanPhone) {
      setMessages([]);
      return;
    }

    const targetSessionId = `dentup_${cleanPhone}`;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('dentup_messages')
        .select('*')
        .eq('session_id', targetSessionId)
        .order('created_at', { ascending: true });

      if (!error) setMessages(data || []);
    };

    fetchMessages();

    const channelName = `chat_messages_${cleanPhone}`;
    const messagesChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dentup_messages',
          filter: `session_id=eq.${targetSessionId}`
        },
        (payload: any) => {
          const newMsg = payload.new;
          if (newMsg) {
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

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [selectedLead?.id, selectedLead?.phone, selectedLead?.phone_number, loadingAuth]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        .from('dentup_messages')
        .insert({ session_id: targetSessionId, message: { type: 'human_agent', content: messageText } })
        .select()
        .single();

      if (!error) {
        setMessages((prev: any[]) =>
          prev.map((msg) => (msg.id === optimisticMessage.id ? insertedMessage : msg))
        );
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

  const isAdmin = userProfile?.cargo?.toLowerCase() === 'admin' || userProfile?.cargo?.toLowerCase() === 'administrador';
  const userUnidade = userProfile?.unidade || 'Todas';

  const sortedLeads = [...leads]
    .filter((lead) => {
      if (isAdmin || !userUnidade || userUnidade === 'Todas') return true;
      const leadUnidade = lead.unidade || lead.unit || 'Sem Unidade';
      return leadUnidade.toLowerCase() === userUnidade.toLowerCase();
    })
    .sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans notranslate" translate="no">
      
      {/* HEADER ULTRA LIMPO NO MOBILE E COMPLETO NO DESKTOP */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 h-14 md:h-16 shrink-0 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Dent'up Odonto" className="h-8 md:h-10 w-auto object-contain" />
          <div className="h-5 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="text-sm md:text-base font-bold text-slate-800 notranslate hidden sm:block" translate="no">
            CRM <span className="text-slate-400 font-medium">Clínica</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3 md:gap-4">
          
          {/* BOTÃO GERENCIAR EQUIPE (ESCONDIDO NO MOBILE -> VISÍVEL SÓ NO DESKTOP `hidden md:flex`) */}
          {isAdmin && (
            <button
              onClick={() => setShowTeamModal(true)}
              className="hidden md:flex bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-md text-xs font-bold transition-all items-center gap-1.5"
            >
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Gerenciar Equipe</span>
            </button>
          )}

          {/* BOTÕES DE NAVEGAÇÃO CHAT / KANBAN (ESCONDIDOS NO MOBILE -> VISÍVEIS SÓ NO DESKTOP `hidden md:flex`) */}
          <div className="hidden md:flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button onClick={() => setAbaAtiva('chat')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate ${abaAtiva === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Chat (Mensagens)
            </button>
            <button onClick={() => setAbaAtiva('kanban')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all notranslate ${abaAtiva === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Quadro CRM
            </button>
          </div>

          {/* PERFIL E BOTÃO SAIR */}
          <div className="flex items-center gap-2 md:gap-3 border-l border-slate-200 pl-3 md:pl-4">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-800 notranslate">{userProfile?.nome || 'Usuário'}</p>
              <div className="flex items-center justify-end gap-1">
                <span className="text-[9px] md:text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">{userProfile?.cargo || 'atendente'}</span>
                {userUnidade !== 'Todas' && (
                  <span className="text-[9px] md:text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded uppercase notranslate">{userUnidade}</span>
                )}
              </div>
            </div>
            <button onClick={handleLogout} title="Encerrar Sessão" className="p-1.5 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50">
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
                        isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
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
                          <span className="text-[11px] text-slate-400 whitespace-nowrap ml-2">{formatarHorario(ultimaInteracao)}</span>
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

                    <button onClick={togglePauseAI} className={`px-3 py-1 md:px-4 md:py-1.5 rounded-lg font-bold text-xs transition-all border shadow-sm notranslate ${
                        selectedLead.is_paused 
                          ? 'bg-red-500 text-white border-red-600 hover:bg-red-600' 
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {selectedLead.is_paused ? '▶ Retomar IA' : '⏸️ Assumir Chat'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 relative z-10 custom-scrollbar">
                    {messages.map((msg) => {
                      const msgType = msg.message?.type || msg.type;
                      const rawContent = msg.message?.content || msg.message?.data?.content || msg.content;
                      if (isMensagemTecnica(rawContent)) return null;

                      const isPatient = msgType === 'human' || msgType === 'user';
                      const isAI = msgType === 'ai' || msgType === 'assistant';
                      const baloes = rawContent.split('###').map((t: string) => t.trim()).filter((t: string) => t.length > 0);

                      return (
                        <React.Fragment key={msg.id}>
                          {baloes.map((texto: string, index: number) => {
                            if (isMensagemTecnica(texto)) return null;
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

                                  <span className="block text-[10px] text-right mt-1.5 text-slate-400">
                                    {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

                  <div className="p-2.5 md:p-3 bg-slate-50 h-[58px] md:h-[64px] shrink-0 flex items-center z-10 border-t border-slate-200">
                    <div className="flex items-center space-x-2 w-full max-w-5xl mx-auto">
                      <div className="flex-1 bg-white rounded-full p-1 md:p-1.5 flex items-center shadow-sm border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <input
                          type="text" placeholder="Digite uma mensagem..."
                          className="flex-1 bg-transparent px-3 py-1 text-sm text-slate-800 outline-none"
                          value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                      </div>
                      <button onClick={handleSendMessage} className="bg-[#00A884] text-white w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-[#008f70] transition-colors shadow-sm shrink-0">
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

      {/* MODAL DE GERENCIAR EQUIPE */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className="bg-blue-600 px-6 py-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h2 className="text-lg font-bold">Gerenciar Equipe Dent'up</h2>
              </div>
              <button onClick={() => setShowTeamModal(false)} className="text-blue-100 hover:text-white text-xl font-bold">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
              
              <form onSubmit={handleAddTeamMember} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 border-b border-slate-200 pb-2">Cadastrar Novo Colaborador</h3>
                
                {teamError && <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-200 font-medium">{teamError}</div>}
                {teamSuccess && <div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded-lg border border-emerald-200 font-medium">{teamSuccess}</div>}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Nome Completo</label>
                    <input type="text" required placeholder="Ex: Ana Silva" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={newMemberNome} onChange={e => setNewMemberNome(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">E-mail Corporativo</label>
                    <input type="email" required placeholder="ana.dentup@gmail.com" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Senha Inicial</label>
                    <input type="password" required placeholder="••••••••" className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500" value={newMemberPass} onChange={e => setNewMemberPass(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Cargo / Função</label>
                    <select className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={newMemberCargo} onChange={e => setNewMemberCargo(e.target.value)}>
                      <option value="atendente">Atendente / Recepcionista</option>
                      <option value="gerente">Gerente de Unidade</option>
                      <option value="admin">Administrador Geral</option>
                      <option value="promotor">Promotor / Divulgador</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <div className="w-1/2 pr-2">
                    <label className="block text-xs font-bold text-slate-600 mb-1">Unidade</label>
                    <select className="w-full px-3 py-2 text-xs border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={newMemberUnidade} onChange={e => setNewMemberUnidade(e.target.value)}>
                      <option value="Todas">Todas as Unidades</option>
                      <option value="Diadema">Diadema</option>
                      <option value="Mauá">Mauá</option>
                      <option value="Santo André">Santo André</option>
                      <option value="São Mateus">São Mateus</option>
                    </select>
                  </div>
                  <button type="submit" disabled={savingMember} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-sm mt-5 disabled:opacity-50">
                    {savingMember ? 'Cadastrando...' : '+ Adicionar Membro'}
                  </button>
                </div>
              </form>

              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-3">Membros da Equipe ({teamMembers.length})</h3>
                <div className="border rounded-xl overflow-hidden border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Nome / E-mail</th>
                        <th className="p-3">Cargo</th>
                        <th className="p-3">Unidade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamMembers.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-bold text-slate-800">{m.nome || 'Sem Nome'}</p>
                            <p className="text-slate-400 text-[11px]">{m.email}</p>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              m.cargo?.toLowerCase() === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>{m.cargo || 'atendente'}</span>
                          </td>
                          <td className="p-3 text-slate-600 font-medium">{m.unidade || 'Todas'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            <div className="bg-slate-50 border-t border-slate-200 p-4 text-right">
              <button onClick={() => setShowTeamModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs transition-all">
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}} />
    </div>
  );
}