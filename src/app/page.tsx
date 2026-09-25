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

      setUserProfile(profile || { nome: session.user.email, cargo: 'admin' });
      setLoadingAuth(false);
    };

    checkUser();
  }, [router]);

  // 2. BUSCA DE LEADS
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

    const leadsChannel = supabase.channel('leads-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, (payload: any) => {
      const newLead = payload.new as any;
      if (!newLead || !newLead.id) return;
      setLeads((curr: any[]) => curr.find(l => l.id === newLead.id) ? curr.map(l => l.id === newLead.id ? newLead : l) : [...curr, newLead]);
      setSelectedLead((prev: any) => prev?.id === newLead.id ? newLead : prev);
    }).subscribe();

    return () => { supabase.removeChannel(leadsChannel); };
  }, [loadingAuth]);

  // 3. BUSCA DE MENSAGENS
  useEffect(() => {
    if (selectedLead && !loadingAuth) {
      const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
      const targetSessionId = `dentup_${cleanPhone}`;
      
      const fetchMessages = async () => {
        if (!cleanPhone) { setMessages([]); return; }
        const { data, error } = await supabase.from('dentup_messages').select('*').eq('session_id', targetSessionId).order('created_at', { ascending: true });
        if (!error) setMessages(data || []);
      };
      fetchMessages();

      const messagesChannel = supabase.channel('messages-channel').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
        const newMsg = payload.new as any;
        if (newMsg && newMsg.session_id === targetSessionId) setMessages((prev: any[]) => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      }).subscribe();

      return () => { supabase.removeChannel(messagesChannel); };
    }
  }, [selectedLead, loadingAuth]);

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
    setLeads((prev: any[]) => prev.map(l => l.id === selectedLead.id ? updatedLead : l));
    await supabase.from('dentup_leads').update({ is_paused: newStatus }).eq('id', selectedLead.id);
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || !selectedLead) return;
    const messageText = newMessage;
    setNewMessage('');
    const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
    const targetSessionId = `dentup_${cleanPhone}`;
    const optimisticMessage = { id: `temp-${Date.now()}`, session_id: targetSessionId, created_at: new Date().toISOString(), message: { type: 'human_agent', content: messageText } };

    setMessages((prev: any[]) => [...prev, optimisticMessage]);

    try {
      if (!selectedLead.is_paused) {
        const leadPausado = { ...selectedLead, is_paused: true };
        setSelectedLead(leadPausado);
        setLeads((prev: any[]) => prev.map(l => l.id === selectedLead.id ? leadPausado : l));
        await supabase.from('dentup_leads').update({ is_paused: true }).eq('id', selectedLead.id);
      }
      const { data: insertedMessage, error } = await supabase.from('dentup_messages').insert({ session_id: targetSessionId, message: { type: 'human_agent', content: messageText } }).select().single();
      if (!error) setMessages((prev: any[]) => prev.map(msg => msg.id === optimisticMessage.id ? insertedMessage : msg));
      
      fetch('https://api.rodolfoxborin.com.br/webhook/crm-envio-humano', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: cleanPhone, content: messageText, session_id: targetSessionId }),
      }).catch(err => console.error(err));
    } catch (error) { console.error(error); }
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

  const sortedLeads = [...leads].sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans notranslate" translate="no">
      
      {/* HEADER PRINCIPAL COM LOGO MAIOR */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Dent'up Odonto" className="h-12 md:h-14 w-auto object-contain" />
          <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
          <h1 className="text-xl font-bold text-slate-800 notranslate hidden sm:block" translate="no">
            CRM <span className="text-slate-400 font-medium">Clínica</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-6">
          {/* BOTÕES DE NAVEGAÇÃO */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button onClick={() => setAbaAtiva('chat')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all notranslate ${abaAtiva === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Chat (Mensagens)
            </button>
            <button onClick={() => setAbaAtiva('kanban')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all notranslate ${abaAtiva === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Quadro CRM
            </button>
          </div>

          {/* PERFIL DO USUÁRIO LOGADO E BOTÃO SAIR */}
          <div className="flex items-center gap-3 border-l border-slate-200 pl-6">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-800 notranslate">{userProfile?.nome || 'Usuário'}</p>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded uppercase notranslate">{userProfile?.cargo || 'admin'}</span>
            </div>
            <button onClick={handleLogout} title="Encerrar Sessão" className="p-2 text-slate-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard onSelectLead={(lead) => { setSelectedLead(lead); setAbaAtiva('chat'); }} />
        ) : (
          <div className="flex h-full w-full bg-white border-x border-slate-200">
            
            {/* SIDEBAR DE CONVERSAS */}
            <div className={`w-full md:w-[380px] border-r border-slate-200 bg-white flex flex-col ${selectedLead ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center h-[70px]">
                <h2 className="text-lg font-bold text-slate-800 notranslate">Mensagens</h2>
                <span className="text-sm bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded-full">{sortedLeads.length}</span>
              </div>
              <ul className="flex-1 overflow-y-auto bg-white custom-scrollbar">
                {sortedLeads.map((lead) => {
                  const ultimaInteracao = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
                  const isSelected = selectedLead?.id === lead.id;
                  const photo = lead.avatar_url || lead.photo_url || lead.profile_pic;

                  return (
                    <li key={lead.id} onClick={() => setSelectedLead(lead)}
                      className={`cursor-pointer p-4 transition-all border-b border-slate-100 flex gap-3.5 items-center ${
                        isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      {photo ? (
                        <img src={photo} alt={lead.name || 'Paciente'} className="w-12 h-12 rounded-full object-cover shrink-0 shadow-sm" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg shrink-0">
                          {lead.name ? lead.name.charAt(0).toUpperCase() : 'P'}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <p className={`font-semibold text-base truncate ${isSelected ? 'text-slate-900' : 'text-slate-800'}`}>{lead.name || 'Sem Nome'}</p>
                          <span className="text-xs text-slate-400 whitespace-nowrap ml-2">{formatarHorario(ultimaInteracao)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-slate-500 truncate">{lead.phone || lead.phone_number}</p>
                          {lead.is_paused && <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-2 shrink-0 notranslate">Humano</span>}
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
                  <div className="bg-slate-50 border-b border-slate-200 p-4 h-[70px] flex justify-between items-center z-10">
                    <div className="flex items-center gap-3.5">
                      <button onClick={() => setSelectedLead(null)} className="md:hidden text-slate-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                      </button>

                      {selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic ? (
                        <img src={selectedLead.avatar_url || selectedLead.photo_url || selectedLead.profile_pic} alt={selectedLead.name} className="w-11 h-11 rounded-full object-cover shadow-sm" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-lg">
                          {selectedLead.name ? selectedLead.name.charAt(0).toUpperCase() : 'P'}
                        </div>
                      )}

                      <div>
                        <h2 className="text-base font-bold text-slate-800">{selectedLead.name || 'Sem Nome'}</h2>
                        <span className="text-sm text-slate-500">{selectedLead.phone || selectedLead.phone_number}</span>
                      </div>
                    </div>

                    <button onClick={togglePauseAI} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all border shadow-sm notranslate ${
                        selectedLead.is_paused 
                          ? 'bg-red-500 text-white border-red-600 hover:bg-red-600' 
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {selectedLead.is_paused ? '▶ Retomar IA' : '⏸️ Assumir Chat'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4 relative z-10 custom-scrollbar">
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
                                <div className={`max-w-[85%] md:max-w-lg rounded-2xl p-4 shadow-sm relative ${
                                    isPatient ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100/80' : 'bg-[#D9FDD3] text-slate-800 rounded-tr-none'
                                  }`}
                                >
                                  <span className={`block text-xs font-bold mb-1.5 notranslate ${
                                    isPatient ? 'text-slate-400' : isAI ? 'text-emerald-700' : 'text-emerald-800'
                                  }`}>
                                    {isPatient ? 'Paciente' : isAI ? 'Lara (IA)' : 'Você (Atendente)'}
                                  </span>

                                  <p className="text-base whitespace-pre-wrap break-words leading-relaxed">{texto}</p>

                                  <span className="block text-[11px] text-right mt-2 text-slate-400">
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

                  <div className="p-4 bg-slate-50 h-[80px] flex items-center z-10 border-t border-slate-200">
                    <div className="flex items-center space-x-3 w-full max-w-5xl mx-auto">
                      <div className="flex-1 bg-white rounded-full p-2 flex items-center shadow-sm border border-slate-300 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
                        <input
                          type="text" placeholder="Digite uma mensagem..."
                          className="flex-1 bg-transparent px-4 py-2 text-base text-slate-800 outline-none"
                          value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                      </div>
                      <button onClick={handleSendMessage} className="bg-[#00A884] text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-[#008f70] transition-colors shadow-sm shrink-0">
                        <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center bg-[#EFEAE2] z-10">
                  <div className="text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <img src="/logo.png" alt="Dent'up Odonto" className="h-20 w-auto mx-auto mb-4 object-contain" />
                    <h3 className="text-xl font-bold text-slate-800 mb-2 notranslate">Dent'up Inbox</h3>
                    <p className="text-base text-slate-500">Selecione uma conversa à esquerda<br/>para iniciar o atendimento.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
      `}} />
    </div>
  );
}