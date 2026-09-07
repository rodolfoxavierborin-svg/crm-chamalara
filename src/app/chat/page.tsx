"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lead } from '../../types';

const ChatPage = () => {
  const [leads, setLeads] = useState<any[]>([]); // Usando any[] para evitar conflitos com a tipagem antiga
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [newMessage, setNewMessage] = useState('');

  // 1. Carrega os Leads
  useEffect(() => {
    const fetchLeads = async () => {
      const { data, error } = await supabase.from('dentup_leads').select('*');
      if (error) {
        console.error('Error fetching leads:', error);
      } else {
        setLeads(data || []);
        if (data && data.length > 0) {
          setSelectedLead(data[0]);
        }
      }
    };

    fetchLeads();

    const leadsChannel = supabase
      .channel('leads-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dentup_leads' },
        (payload) => {
          setLeads((currentLeads) => {
            const existingLead = currentLeads.find((lead) => lead.id === payload.new.id);
            if (existingLead) {
              return currentLeads.map((lead) =>
                lead.id === payload.new.id ? payload.new : lead
              );
            } else {
              return [...currentLeads, payload.new];
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
    };
  }, []);

  // 2. Carrega as Mensagens 
  useEffect(() => {
    if (selectedLead) {
      // Pega o telefone independente de como a coluna se chame no banco
      const rawPhone = selectedLead.phone || selectedLead.phone_number || '';
      const cleanPhone = rawPhone.replace(/\D/g, '');
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
          (payload) => {
            if (payload.new.session_id === targetSessionId) {
              setMessages((currentMessages) => [...currentMessages, payload.new]);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedLead]);

  // 3. Alterna a pausa da IA
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

  // 4. Envia mensagem manual
  const handleSendMessage = async () => {
    if (newMessage.trim() === '' || !selectedLead) return;

    const messageText = newMessage;
    setNewMessage('');

    const rawPhone = selectedLead.phone || selectedLead.phone_number || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
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

  if (!selectedLead) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p>Selecione um lead para iniciar a conversa.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - Lista de Leads */}
      <div className="w-1/3 border-r bg-white p-4 overflow-y-auto">
        <h2 className="mb-4 text-xl font-semibold">Conversas Recentes</h2>
        <ul>
          {leads.map((lead) => {
            const displayPhone = lead.phone || lead.phone_number || '';
            return (
              <li
                key={lead.id}
                className={`mb-2 cursor-pointer rounded-md p-2 hover:bg-gray-50 flex justify-between items-center ${
                  selectedLead?.id === lead.id ? 'bg-blue-100' : ''
                }`}
                onClick={() => setSelectedLead(lead)}
              >
                <div>
                  <p className="font-medium">{lead.name || 'Sem Nome'}</p>
                  <p className="text-sm text-gray-500">{displayPhone}</p>
                </div>
                {lead.is_paused && (
                  <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded font-semibold">
                    Pausado
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Area Central do Chat */}
      <div className="flex w-2/3 flex-col">
        {/* Header do Chat */}
        <div className="border-b bg-white p-4 shadow-sm flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">
              {selectedLead.name || 'Sem Nome'} ({selectedLead.phone || selectedLead.phone_number || ''})
            </h2>
          </div>

          <button
            onClick={togglePauseAI}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${
              selectedLead.is_paused
                ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300'
            }`}
          >
            {selectedLead.is_paused ? '⏸️ IA Pausada (Atendimento Humano)' : '🤖 IA Ativa'}
          </button>
        </div>

        {/* Histórico de Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => {
            const msgType = msg.message?.type || msg.type;
            const msgContent = msg.message?.content || msg.content;

            if (!msgContent) return null;

            const isPatient = msgType === 'human';
            const isAI = msgType === 'ai';

            return (
              <div
                key={msg.id}
                className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-xs rounded-lg p-3 shadow-sm ${
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
                  <p className="text-sm whitespace-pre-wrap">{msgContent}</p>
                  <span className="mt-1 block text-xs opacity-75">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input para Envio */}
        <div className="border-t bg-white p-4">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Digite sua mensagem..."
              className="flex-1 rounded-md border p-2 focus:border-blue-500 focus:outline-none text-gray-800"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSendMessage();
                }
              }}
            />
            <button
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 font-medium"
              onClick={handleSendMessage}
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;