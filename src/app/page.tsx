"use client";

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import KanbanBoard from '../../components/KanbanBoard';

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

// Filtro rigoroso para ocultar logs de chamadas técnicas de ferramentas da IA
const isMensagemTecnica = (texto: string): boolean => {
  if (!texto || typeof texto !== 'string') return true;
  const t = texto.trim();
  
  if (t.startsWith('[{') || t.startsWith('{"')) return true;
  if (t.startsWith('Calling ') || t.includes('with input:')) return true;
  if (t.includes('Confirmar_Agendamento') || t.includes('Create_an_event') || t.includes('Call_Sub-workflow')) return true;
  
  return false;
};

const ChatPage = () => {
  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'kanban'>('chat');
  const [leads, setLeads] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
      
      // Correção TypeScript: Tipagem explícita para curr e prev
      setLeads((curr: any[]) => curr.find(l => l.id === newLead.id) ? curr.map(l => l.id === newLead.id ? newLead : l) : [...curr, newLead]);
      setSelectedLead((prev: any) => prev?.id === newLead.id ? newLead : prev);
    }).subscribe();
    return () => { supabase.removeChannel(leadsChannel); };
  }, []);

  useEffect(() => {
    if (selectedLead) {
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
        // Correção TypeScript: Tipagem explícita para prev
        if (newMsg && newMsg.session_id === targetSessionId) setMessages((prev: any[]) => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      }).subscribe();
      return () => { supabase.removeChannel(messagesChannel); };
    }
  }, [selectedLead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const togglePauseAI = async () => {
    if (!selectedLead) return;
    const newStatus = !selectedLead.is_paused;
    const updatedLead = { ...selectedLead, is_paused: newStatus };
    setSelectedLead(updatedLead);
    // Correção TypeScript: Tipagem explícita para prev
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
    
    // Correção TypeScript: Tipagem explícita para prev
    setMessages((prev: any[]) => [...prev, optimisticMessage]);

    try {
      if (!selectedLead.is_paused) {
        const leadPausado = { ...selectedLead, is_paused: true };
        setSelectedLead(leadPausado);
        // Correção TypeScript: Tipagem explícita para prev
        setLeads((prev: any[]) => prev.map(l => l.id === selectedLead.id ? leadPausado : l));
        await supabase.from('dentup_leads').update({ is_paused: true }).eq('id', selectedLead.id);
      }
      const { data: insertedMessage, error } = await supabase.from('dentup_messages').insert({ session_id: targetSessionId, message: { type: 'human_agent', content: messageText } }).select().single();
      // Correção TypeScript: Tipagem explícita para prev
      if (!error) setMessages((prev: any[]) => prev.map(msg => msg.id === optimisticMessage.id ? insertedMessage : msg));
      
      fetch('https://api.rodolfoxborin.com.br/webhook/crm-envio-humano', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: cleanPhone, content: messageText, session_id: targetSessionId }),
      }).catch(err => console.error(err));
    } catch (error) { console.error(error); }
  };

  const sortedLeads = [...leads].sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans">
      
      {/* HEADER PRINCIPAL COM ALTERNÂNCIA DE ABAS */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-lg shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Dent'up <span className="text-slate-400 font-medium">Clínica</span></h1>
        </div>
        
        {/* BOTÕES DE NAVEGAÇÃO ENTRE CHAT E KANBAN/ANALYTICS */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button onClick={() => setAbaAtiva('chat')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all ${abaAtiva === 'chat' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Chat (Mensagens)
          </button>
          <button onClick={() => setAbaAtiva('kanban')} className={`px-5 py-2 rounded-md text-sm font-bold transition-all ${abaAtiva === 'kanban' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            Quadro CRM
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard onSelectLead={(lead) => { setSelectedLead(lead); setAbaAtiva('chat'); }} />
        ) : (
          <div className="flex h-full w-full bg-white border-x border-slate-200">
            
            {/* SIDEBAR DE CONVERSAS (Estilo WhatsApp) */}
            <div className={`w-full md:w-[380px] border-r border-slate-200 bg-white flex flex-col ${selectedLead ? 'hidden md:flex' : 'flex'}`}>
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center h-[70px]">
                <h2 className="text-lg font-bold text-slate-800">Mensagens</h2>
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
                      {/* FOTO DE PERFIL / FALLBACK INICIAL */}
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
                          {lead.is_paused && <span className="bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase ml-2 shrink-0">Humano</span>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ÁREA DO CHAT (WhatsApp Clean em #D9FDD3) */}
            <div className={`flex-1 flex-col bg-[#EFEAE2] relative ${selectedLead ? 'flex' : 'hidden md:flex'}`}>
              <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")' }}></div>

              {selectedLead ? (
                <>
                  {/* HEADER DO CHAT */}
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

                    <button onClick={togglePauseAI} className={`px-5 py-2 rounded-lg font-bold text-sm transition-all border shadow-sm ${
                        selectedLead.is_paused 
                          ? 'bg-red-500 text-white border-red-600 hover:bg-red-600' 
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {selectedLead.is_paused ? '▶ Retomar IA' : '⏸️ Assumir Chat'}
                    </button>
                  </div>

                  {/* BALÕES DE MENSAGENS */}
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
                                    isPatient 
                                      ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100/80' 
                                      : 'bg-[#D9FDD3] text-slate-800 rounded-tr-none' // Verde WhatsApp Web Original
                                  }`}
                                >
                                  <span className={`block text-xs font-bold mb-1.5 ${
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

                  {/* INPUT BAR WHATSAPP */}
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
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">Dent'up Inbox</h3>
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
};

export default ChatPage;