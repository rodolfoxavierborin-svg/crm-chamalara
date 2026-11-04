// File: src/hooks/useLeads.ts

"use client";

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getUltimaInteracao } from '../utils/dateUtils';
import {
  fetchAllLeadsFromSupabase,
  extrairVoucherDeTexto,
  updateLeadResiliente
} from '../utils/kanbanUtils';

export function useLeads(loadingAuth: boolean) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);

  useEffect(() => {
    if (loadingAuth) return;

    const fetchLeads = async () => {
      setLoadingLeads(true);
      const allData = await fetchAllLeadsFromSupabase(supabase);
      setLeads(allData);
      setLoadingLeads(false);
    };

    fetchLeads();

    // 1. WebSocket de atualizações na tabela de leads
    const leadsChannel = supabase
      .channel('leads-global-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dentup_leads' }, (payload: any) => {
        if (payload.eventType === 'DELETE' && payload.old) {
          setLeads((curr) => curr.filter((l) => String(l.id) !== String(payload.old.id)));
          return;
        }

        const newLead = payload.new as any;
        if (!newLead || !newLead.id) return;

        setLeads((curr) => {
          const existing = curr.find((l) => String(l.id) === String(newLead.id));
          if (existing) {
            const localTime = getUltimaInteracao(existing);
            const dbTime = getUltimaInteracao(newLead);

            if (localTime > dbTime) {
              newLead.ultima_interacao = existing.ultima_interacao;
              newLead['última_interação'] = existing['última_interação'];
            }
            return curr.map((l) => (String(l.id) === String(newLead.id) ? newLead : l));
          }
          return [newLead, ...curr];
        });
      })
      .subscribe();

    // 2. WebSocket para atualizar última interação e capturar Voucher VIP automaticamente quando chega nova mensagem
    const globalMessagesChannel = supabase
      .channel('global-messages-sidebar-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dentup_messages' }, (payload: any) => {
        const newMsg = payload.new;
        if (!newMsg || !newMsg.session_id) return;

        const cleanPhoneFromSession = newMsg.session_id.replace('dentup_', '');
        const msgContent =
          typeof newMsg.message === 'string'
            ? newMsg.message
            : newMsg.message?.content || newMsg.message?.text || '';
        const voucherExtraido = extrairVoucherDeTexto(msgContent);

        setLeads((currLeads) => {
          return currLeads.map((lead) => {
            const leadPhone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
            if (leadPhone === cleanPhoneFromSession) {
              const msgDate = newMsg.created_at || new Date().toISOString();
              const updatedLead: any = {
                ...lead,
                ultima_interacao: msgDate,
                'última_interação': msgDate,
              };

              // Se a Lara acabou de emitir um Voucher VIP no chat, blinda imediatamente o agendamento no banco
              if (voucherExtraido && lead.voucher !== voucherExtraido) {
                updatedLead.voucher = voucherExtraido;
                updatedLead.tipo_agendamento = 'lara';
                updatedLead.agendado_por = 'Lara (IA)';

                updateLeadResiliente(supabase, lead.id, {
                  voucher: voucherExtraido,
                  tipo_agendamento: 'lara',
                  agendado_por: 'Lara (IA)',
                }).catch((err) => console.error('Erro ao salvar voucher automático:', err));
              }

              return updatedLead;
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

  return { leads, setLeads, loadingLeads };
}
