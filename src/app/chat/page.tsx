"use client";

import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import KanbanBoard from '../../components/KanbanBoard';

const formatarHorario = (dataIso: string | null) => {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  const hoje = new Date();
  
  const ehHoje = data.toDateString() === hoje.toDateString();
  
  if (ehHoje) {
    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else {
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
};

const getUltimaInteracao = (lead: any) => {
  const rawDate = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
  return rawDate ? new Date(rawDate).getTime() : 0;
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
      const { data, error } = await supabase
        .from('dentup_leads')
        .select('*');

      if (error) {
        console.error('Error fetching leads:', error);
      } else {
        const leadsData = data || [];
        setLeads(leadsData);
        if (leadsData.length > 0 && !selectedLead) {
          const sortedInitial = [...leadsData].sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));
          setSelectedLead(sortedInitial[0]);
        }
      }
    };

    fetchLeads();

    const leadsChannel = supabase
      .channel('leads-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dentup_leads' },
        (payload: any) => {
          const newLead = payload.new as any;
          if (!newLead || !newLead.id) return;

          setLeads((currentLeads) => {
            const existingLead = currentLeads.find((lead) => lead.id === newLead.id);
            if (existingLead) {
              return currentLeads.map((lead) =>
                lead.id === newLead.id ? newLead : lead
              );
            } else {
              return [...currentLeads, newLead];
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
    };
  }, []);

  useEffect(() => {
    if (selectedLead) {
      const rawPhone = selectedLead.phone || selectedLead.phone_number || '';
      const cleanPhone = rawPhone.replace(new RegExp('\\D', 'g'), '');
      const targetSessionId = `dentup_${cleanPhone}`;

      const fetchMessages = async () => {
        if (!cleanPhone) {
          setMessages([]);
          return;
        }

        const { data, error } = await supabase
          .from('dentup_messages')
          .select('*')
          .eq('session_id', targetSessionId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching messages:', error);
        } else {
          setMessages(data || []);
        }
      };

      fetchMessages();

      const messagesChannel = supabase
        .channel('messages-channel')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'dentup_messages' },
          (payload: any) => {
            const newMsg = payload.new as any;
            if (newMsg && newMsg.session_id === targetSessionId) {
              setMessages((currentMessages) => [...currentMessages, newMsg]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedLead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const togglePauseAI = async () => {
    if (!selectedLead) return;
    const newStatus = !selectedLead.is_paused;

    const { error } = await supabase
      .from('dentup_leads')
      .update({ is_paused: newStatus })
      .eq('id', selectedLead.id);

    if (error) {
      console.error('Erro ao alternar pausa da IA:', error);
    } else {
      const updatedLead = { ...selectedLead, is_paused: newStatus };
      setSelectedLead(updatedLead);
    }
  };

  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || !selectedLead) return;

    const messageText = newMessage;
    setNewMessage('');

    const rawPhone = selectedLead.phone || selectedLead.phone_number || '';
    const cleanPhone = rawPhone.replace(new RegExp('\\D', 'g'), '');
    const targetSessionId = `dentup_${cleanPhone}`;

    try {
      const { data: insertedMessage, error: dbError } = await supabase
        .from('dentup_messages')
        .insert({
          lead_id: selectedLead.id,
          session_id: targetSessionId,
          message: { type: 'human_agent', content: messageText }
        })
        .select()
        .single();

      if (dbError) {
        console.error('Error saving message:', dbError);
        return;
      }

      await fetch('https://api.rodolfoxborin.com.br/webhook/crm-envio-humano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: selectedLead.id,
          phone_number: cleanPhone,
          content: messageText,
          message_id: insertedMessage.id,
        }),
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const sortedLeads = [...leads].sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      <div className="bg-white border-b px-4 py-2.5 flex items-center justify-between shadow-sm z-10">
        <h1 className="text-base md:text-lg font-bold text-gray-800 flex items-center gap-2">
          ⚡ Dent'up CRM
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAbaAtiva('chat')}
            className={`px-3.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition ${
              abaAtiva === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            💬 Chat ao Vivo
          </button>
          <button
            onClick={() => setAbaAtiva('kanban')}
            className={`px-3.5 py-1.5 rounded-md text-xs md:text-sm font-medium transition ${
              abaAtiva === 'kanban'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            📋 Quadro CRM (Kanban)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setAbaAtiva('chat');
            }}
          />
        ) : (
          <div className="flex h-full">
            <div className={`w-full md:w-1/3 border-r bg-white p-4 overflow-y-auto ${selectedLead ? 'hidden md:block' : 'block'}`}>
              <h2 className="mb-4 text-xl font-semibold text-gray-900">Conversas Recentes</h2>
              <ul>
                {sortedLeads.map((lead) => {
                  const displayPhone = lead.phone || lead.phone_number || '';
                  const ultimaInteracao = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
                  
                  return (
                    <li
                      key={lead.id}
                      className={`mb-2 cursor-pointer rounded-md p-3 hover:bg-gray-50 flex flex-col justify-between border-b md:border-none ${
                        selectedLead?.id === lead.id ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <div className="flex justify-between items-start w-full">
                        <div>
                          <p className="font-medium text-gray-900">{lead.name || 'Sem Nome'}</p>
                          <p className="text-sm text-gray-500">{displayPhone}</p>
                        </div>
                        <div className="text-xs text-gray-400 font-medium whitespace-nowrap ml-2">
                          {formatarHorario(ultimaInteracao)}
                        </div>
                      </div>
                      {lead.is_paused && (
                        <div className="mt-1">
                          <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-semibold uppercase tracking-wider">
                            Pausado
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={`w-full md:w-2/3 flex-col ${selectedLead ? 'flex' : 'hidden md:flex'}`}>
              {selectedLead ? (
                <>
                  <div className="border-b bg-white p-3 md:p-4 shadow-sm flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedLead(null)}
                        className="md:hidden mr-2 p-2 bg-gray-100 rounded-md text-gray-600 hover:bg-gray-200 transition"
                      >
                        ⬅️ Voltar
                      </button>
                      <div>
                        <h2 className="text-lg md:text-xl font-semibold text-gray-800">
                          {selectedLead.name || 'Sem Nome'}
                        </h2>
                        <span className="text-sm text-gray-500">
                          {selectedLead.phone || selectedLead.phone_number || ''}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={togglePauseAI}
                      className={`w-full md:w-auto px-4 py-2 rounded-md font-medium text-sm transition-colors text-center ${
                        selectedLead.is_paused
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300'
                      }`}
                    >
                      {selectedLead.is_paused ? '⏸️ IA Pausada (Atend. Humano)' : '🤖 IA Ativa'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.map((msg) => {
                      const msgType = msg.message?.type || msg.type;
                      const msgContent = msg.message?.content || msg.content;

                      if (!msgContent || typeof msgContent !== 'string') return null;

                      const trimmed = msgContent.trim();
                      if (trimmed.startsWith('[{') || trimmed.startsWith('{"')) return null;
                      if (msgContent.includes('Calling Create_an_event') || msgContent.includes('Calling Buscar')) return null;

                      const isPatient = msgType === 'human' || msgType === 'user';
                      const isAI = msgType === 'ai' || msgType === 'assistant';

                      const partesMensagem = msgContent.split('###').map((p: string) => p.trim()).filter((p: string) => p.length > 0);

                      return (
                        <React.Fragment key={msg.id}>
                          {partesMensagem.map((parte: string, index: number) => (
                            <div
                              key={`${msg.id}-${index}`}
                              className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}
                            >
                              <div
                                className={`max-w-[85%] md:max-w-xs rounded-lg p-3 shadow-sm ${
                                  isPatient
                                    ? 'bg-white text-gray-800 border'
                                    : isAI
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                <span className="block text-xs font-semibold mb-1 opacity-75">
                                  {isPatient ? 'Paciente' : isAI ? 'Lara (IA)' : 'Atendente'}
                                </span>
                                <p className="text-sm whitespace-pre-wrap break-words">{parte}</p>
                                <span className="mt-1 block text-[10px] opacity-75 text-right">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t bg-white p-3 md:p-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Digite sua mensagem..."
                        className="flex-1 rounded-md border p-3 md:p-2 focus:border-blue-500 focus:outline-none text-gray-800 text-sm md:text-base"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleSendMessage();
                          }
                        }}
                      />
                      <button
                        className="rounded-md bg-blue-600 px-4 py-3 md:py-2 text-white hover:bg-blue-700 font-medium text-sm md:text-base"
                        onClick={handleSendMessage}
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center bg-gray-50">
                  <p className="text-gray-500 font-medium">Selecione um lead ao lado para iniciar a conversa.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;