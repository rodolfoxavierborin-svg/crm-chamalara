// File: src/app/page.tsx

"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import KanbanBoard from '../components/KanbanBoard';
import TeamModal from '../components/modals/TeamModal';
import Header from '../components/layout/Header';
import ChatSidebar from '../components/chat/ChatSidebar';
import ChatWindow from '../components/chat/ChatWindow';
import { useLeads } from '../hooks/useLeads';
import { getUltimaInteracao } from '../utils/dateUtils';
import { formatDateSeparator, parseMensagem, isMensagemTecnica } from '../utils/chatUtils';

export default function HomePage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'kanban'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Controle do Modal de Equipe
  const [showTeamModal, setShowTeamModal] = useState(false);

  // Hook centralizado de busca e WebSocket em tempo real de Leads
  const { leads, setLeads } = useLeads(loadingAuth);

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

  // SELEÇÃO AUTOMÁTICA DO PRIMEIRO LEAD COM MENSAGEM AO CARREGAR
  useEffect(() => {
    if (leads.length > 0) {
      if (!selectedLead) {
        const sortedWithChat = [...leads]
          .filter((lead) => {
            const ms = getUltimaInteracao(lead);
            const isManualWithoutChat = lead.origem === 'manual' && !lead.ultima_interacao;
            return ms > 0 && !isManualWithoutChat;
          })
          .sort((a, b) => getUltimaInteracao(b) - getUltimaInteracao(a));

        if (sortedWithChat.length > 0) {
          setSelectedLead(sortedWithChat[0]);
        }
      } else {
        const updated = leads.find((l) => l.id === selectedLead.id);
        if (updated) {
          setSelectedLead((prev: any) => ({ ...prev, ...updated }));
        }
      }
    }
  }, [leads]);

  // BUSCA E CANAL REALTIME DE MENSAGENS DO LEAD SELECIONADO
  useEffect(() => {
    if (!selectedLead || loadingAuth) return;
    const cleanPhone = (selectedLead.phone || selectedLead.phone_number || '').replace(/\D/g, '');
    if (!cleanPhone) { setMessages([]); return; }

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

  // SCROLL AUTOMÁTICO PARA O FINAL DAS MENSAGENS
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
        .from('dentup_messages')
        .insert({ session_id: targetSessionId, message: { type: 'human_agent', content: messageText } })
        .select()
        .single();

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

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans notranslate" translate="no">
      {/* HEADER COMPONENTIZADO */}
      <Header
        userProfile={userProfile}
        abaAtiva={abaAtiva}
        setAbaAtiva={setAbaAtiva}
        isAdmin={isAdmin}
        userUnidade={userUnidade}
        onOpenTeamModal={() => setShowTeamModal(true)}
        onLogout={handleLogout}
      />

      {/* CORPO PRINCIPAL */}
      <div className="flex-1 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard
            userProfile={userProfile}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setAbaAtiva('chat');
            }}
          />
        ) : (
          <div className="flex h-full w-full bg-white border-x border-slate-200">
            {/* SIDEBAR DE CONVERSAS COMPONENTIZADA */}
            <ChatSidebar
              sortedLeads={sortedLeads}
              selectedLead={selectedLead}
              onSelectLead={(lead) => setSelectedLead(lead)}
              isAdmin={isAdmin}
              userUnidade={userUnidade}
            />

            {/* ÁREA DO CHAT COMPONENTIZADA */}
            <ChatWindow
              selectedLead={selectedLead}
              onBackMobile={() => setSelectedLead(null)}
              onTogglePauseAI={togglePauseAI}
              messages={messages}
              isMensagemTecnica={isMensagemTecnica}
              parseMensagem={parseMensagem}
              formatDateSeparator={formatDateSeparator}
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              messagesEndRef={messagesEndRef}
            />
          </div>
        )}
      </div>

      {/* MODAL ISOLADO DE GERENCIAMENTO DE EQUIPE */}
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