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
import { parseDataSegura } from '../utils/dateUtils';
import { formatDateSeparator, parseMensagem, isMensagemTecnica } from '../utils/chatUtils';
import {
  extrairVoucherDeTexto,
  isLeadAgendadoPelaLara,
  obterVoucherDoLead,
  updateLeadResiliente
} from '../utils/kanbanUtils';

export default function HomePage() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [abaAtiva, setAbaAtiva] = useState<'chat' | 'kanban'>('chat');
  const [messages, setMessages] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mapa com o timestamp da ÚLTIMA MENSAGEM REAL por telefone
  const [lastMessageMap, setLastMessageMap] = useState<Record<string, string>>({});

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

  // BUSCA INICIAL E WEBSOCKET DAS MENSAGENS PARA MAPEAMENTO DE CHAT ATIVO
  useEffect(() => {
    if (loadingAuth) return;

    const fetchLastMessages = async () => {
      const { data, error } = await supabase
        .from('dentup_messages')
        .select('session_id, created_at')
        .order('created_at', { ascending: false })
        .limit(3000);

      if (!error && data) {
        const map: Record<string, string> = {};
        data.forEach((msg) => {
          if (!msg.session_id) return;
          const cleanPhone = msg.session_id.replace('dentup_', '').replace(/\D/g, '');
          if (!map[cleanPhone]) {
            map[cleanPhone] = msg.created_at;
          }
        });
        setLastMessageMap(map);
      }
    };

    fetchLastMessages();

    // Nome dinâmico para evitar colisão de canais no Fast Refresh do Next.js
    const channelName = `global-messages-sidebar-${Date.now()}`;
    const globalMessagesChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
        const newMsg = payload.new;
        if (!newMsg || !newMsg.session_id) return;
        if (isMensagemTecnica(newMsg)) return;

        const cleanPhoneFromSession = newMsg.session_id.replace('dentup_', '').replace(/\D/g, '');
        const msgDate = newMsg.created_at || new Date().toISOString();

        setLastMessageMap((prev) => ({
          ...prev,
          [cleanPhoneFromSession]: msgDate
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(globalMessagesChannel);
    };
  }, [loadingAuth]);

  // SELEÇÃO AUTOMÁTICA DO PRIMEIRO LEAD COM MENSAGEM REAL AO CARREGAR (APENAS DESKTOP)
  useEffect(() => {
    if (leads.length > 0 && Object.keys(lastMessageMap).length > 0) {
      if (!selectedLead) {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
        if (!isDesktop) return;

        const activeLeads = leads
          .filter((lead) => {
            const cleanPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
            return !!lastMessageMap[cleanPhone];
          })
          .sort((a, b) => {
            const phoneA = (a.phone || a.phone_number || '').replace(/\D/g, '');
            const phoneB = (b.phone || b.phone_number || '').replace(/\D/g, '');
            return parseDataSegura(lastMessageMap[phoneB]) - parseDataSegura(lastMessageMap[phoneA]);
          });

        if (activeLeads.length > 0) {
          setSelectedLead(activeLeads[0]);
        }
      } else {
        const updated = leads.find((l) => l.id === selectedLead.id);
        if (updated) {
          setSelectedLead((prev: any) => ({ ...prev, ...updated }));
        }
      }
    }
  }, [leads, lastMessageMap]);

  // BUSCA E CANAL REALTIME DE MENSAGENS DO LEAD SELECIONADO + CAPTURA DE VOUCHER VIP
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
      if (!error && data) {
        setMessages(data);

        // Verifica se alguma mensagem da IA no histórico já emitiu Voucher VIP e sincroniza com o lead
        for (const msg of data) {
          const content =
            typeof msg.message === 'string'
              ? msg.message
              : msg.message?.content || msg.message?.text || '';
          const v = extrairVoucherDeTexto(content);
          if (v && selectedLead.voucher !== v) {
            const voucherUpdates = {
              voucher: v,
              tipo_agendamento: 'lara',
              agendado_por: 'Lara (IA)',
            };
            setSelectedLead((prev: any) => (prev ? { ...prev, ...voucherUpdates } : prev));
            setLeads((prev: any[]) =>
              prev.map((l) => (l.id === selectedLead.id ? { ...l, ...voucherUpdates } : l))
            );
            updateLeadResiliente(supabase, selectedLead.id, voucherUpdates).catch(() => {});
            break;
          }
        }
      }
    };
    fetchMessages();

    const channelName = `chat_messages_realtime_${cleanPhone}_${Date.now()}`;
    const messagesChannel = supabase
      .channel(channelName)
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

  const togglePauseAI = async (motivo?: string) => {
    if (!selectedLead) return;
    const newStatus = !selectedLead.is_paused;
    const updates: any = { is_paused: newStatus };

    if (newStatus) {
      const nomeResp = userProfile?.nome || userProfile?.email || 'Atendente';
      updates.pausado_por = nomeResp;
      updates.data_pausa = new Date().toISOString();
      updates.motivo_pausa = motivo || 'Assumido via Chat de Mensagens';
      updates.responsavel_id = userProfile?.id || null;
      updates.responsavel_nome = nomeResp;
    } else {
      updates.pausado_por = null;
    }

    // Preserva 100% a autoria do agendamento da Lara somente se houver Voucher VIP real
    if (isLeadAgendadoPelaLara(selectedLead) && selectedLead.voucher) {
      updates.tipo_agendamento = 'lara';
      updates.agendado_por = 'Lara (IA)';
      updates.voucher = selectedLead.voucher;
    }

    const updatedLead = { ...selectedLead, ...updates };
    setSelectedLead(updatedLead);
    setLeads((prev: any[]) => prev.map((l) => (l.id === selectedLead.id ? updatedLead : l)));
    await updateLeadResiliente(supabase, selectedLead.id, updates);
  };

  const handleSendMessage = async (motivo?: string) => {
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
        const nomeResp = userProfile?.nome || userProfile?.email || 'Atendente';
        const pauseUpdates: any = {
          is_paused: true,
          pausado_por: nomeResp,
          data_pausa: new Date().toISOString(),
          motivo_pausa: motivo || 'Assumido via Envio de Mensagem',
          responsavel_id: userProfile?.id || null,
          responsavel_nome: nomeResp,
        };

        if (isLeadAgendadoPelaLara(selectedLead) && selectedLead.voucher) {
          pauseUpdates.tipo_agendamento = 'lara';
          pauseUpdates.agendado_por = 'Lara (IA)';
          pauseUpdates.voucher = selectedLead.voucher;
        }

        const leadPausado = { ...selectedLead, ...pauseUpdates };
        setSelectedLead(leadPausado);
        setLeads((prev: any[]) => prev.map((l) => (l.id === selectedLead.id ? leadPausado : l)));
        await updateLeadResiliente(supabase, selectedLead.id, pauseUpdates);
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
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center">
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

  // FILTRAGEM E ORDENAÇÃO BASEADA ESTRITAMENTE NA TABELA DE MENSAGENS
  const sortedLeadsWithChat = leads
    .filter((lead) => {
      if (!isAdmin && userUnidade && userUnidade !== 'Todas') {
        const leadUnidade = lead.unidade || lead.unit || 'Sem Unidade';
        if (leadUnidade.toLowerCase() !== userUnidade.toLowerCase()) return false;
      }

      const cleanPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
      return !!lastMessageMap[cleanPhone];
    })
    .map((lead) => {
      const cleanPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
      return {
        ...lead,
        ultima_interacao_real: lastMessageMap[cleanPhone]
      };
    })
    .sort((a, b) => {
      return parseDataSegura(b.ultima_interacao_real) - parseDataSegura(a.ultima_interacao_real);
    });

  const isMobileChatOpen = abaAtiva === 'chat' && Boolean(selectedLead);

  return (
    <div className="flex flex-col h-dvh bg-slate-50 text-slate-800 font-sans notranslate overflow-hidden" translate="no">
      {/* HEADER COMPONENTIZADO (oculto no mobile quando dentro de uma conversa ativa para tela cheia) */}
      <Header
        userProfile={userProfile}
        abaAtiva={abaAtiva}
        setAbaAtiva={setAbaAtiva}
        isAdmin={isAdmin}
        userUnidade={userUnidade}
        onOpenTeamModal={() => setShowTeamModal(true)}
        onLogout={handleLogout}
        hideOnMobile={isMobileChatOpen}
      />

      {/* CORPO PRINCIPAL */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {abaAtiva === 'kanban' ? (
          <KanbanBoard
            userProfile={userProfile}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setAbaAtiva('chat');
            }}
          />
        ) : (
          <div className="flex h-full min-h-0 w-full bg-white md:border-x border-slate-200">
            {/* SIDEBAR DE CONVERSAS COMPONENTIZADA */}
            <ChatSidebar
              sortedLeads={sortedLeadsWithChat}
              selectedLead={selectedLead}
              onSelectLead={(lead) => setSelectedLead(lead)}
              isAdmin={isAdmin}
              userUnidade={userUnidade}
            />

            {/* ÁREA DO CHAT COMPONENTIZADA COM TRAVA ANTIFRAUDE */}
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
              userProfile={userProfile}
            />
          </div>
        )}
      </div>

      {/* BARRA DE NAVEGAÇÃO INFERIOR MOBILE (iOS & Android) */}
      {!isMobileChatOpen && (
        <nav
          aria-label="Navegação principal"
          className="md:hidden shrink-0 bg-white border-t border-slate-200 px-2 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] flex items-center justify-around z-20 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
        >
          <button
            type="button"
            onClick={() => {
              setAbaAtiva('chat');
              setSelectedLead(null);
            }}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors relative cursor-pointer ${
              abaAtiva === 'chat' ? 'text-blue-600' : 'text-slate-500 active:bg-slate-100'
            }`}
          >
            <div className="relative">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={abaAtiva === 'chat' ? 2.4 : 1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {sortedLeadsWithChat.length > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-blue-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full leading-tight">
                  {sortedLeadsWithChat.length > 99 ? '99+' : sortedLeadsWithChat.length}
                </span>
              )}
            </div>
            <span className="text-[11px] font-bold mt-0.5 notranslate">Conversas</span>
          </button>

          <button
            type="button"
            onClick={() => setAbaAtiva('kanban')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
              abaAtiva === 'kanban' ? 'text-blue-600' : 'text-slate-500 active:bg-slate-100'
            }`}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={abaAtiva === 'kanban' ? 2.4 : 1.9}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            <span className="text-[11px] font-bold mt-0.5 notranslate">Quadro CRM</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowTeamModal(true)}
              className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-slate-500 active:bg-slate-100 transition-colors cursor-pointer"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.9}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-[11px] font-bold mt-0.5 notranslate">Equipe</span>
            </button>
          )}
        </nav>
      )}

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
