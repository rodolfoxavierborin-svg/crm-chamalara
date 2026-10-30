// File: src/hooks/useFilteredLeads.ts

"use client";

import { useMemo } from 'react';
import { parseDataSegura } from '../utils/dateUtils';

export function useFilteredLeads(
  leads: any[],
  selectedUnit: string,
  selectedPeriod: string,
  searchQuery: string,
  isAdmin: boolean,
  userUnidade: string
) {
  const filteredLeads = useMemo(() => {
    if (!Array.isArray(leads)) return [];

    const now = new Date();
    // Data atual formatada no fuso de São Paulo (YYYY-MM-DD)
    const spNowStr = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    return leads.filter((lead) => {
      // 1. FILTRO DE UNIDADE E PERMISSÕES DE ACESSO
      const leadUnit = lead.unidade || lead.unit || 'Sem Unidade';
      if (!isAdmin && userUnidade && userUnidade !== 'Todas') {
        if (leadUnit.toLowerCase() !== userUnidade.toLowerCase()) return false;
      }
      if (selectedUnit && selectedUnit !== 'Todas as Unidades' && selectedUnit !== 'Todas') {
        if (leadUnit.toLowerCase() !== selectedUnit.toLowerCase()) return false;
      }

      // 2. FILTRO DE PESQUISA (NOME OU TELEFONE)
      if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const name = (lead.name || lead.nome || '').toLowerCase();
        const phone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
        const rawPhone = (lead.phone || lead.phone_number || '').toLowerCase();
        if (!name.includes(query) && !phone.includes(query) && !rawPhone.includes(query)) {
          return false;
        }
      }

      // 3. FILTRO DETERMINÍSTICO DE PERÍODO (REGRA TRIPLA DE DATAS NO FUSO SP)
      if (selectedPeriod === 'Todo o Período' || selectedPeriod === 'todos') return true;

      // Obtém o timestamp das 3 datas vitais do paciente
      const msCreated = parseDataSegura(lead.created_at || lead.created);
      const msAgendamento = parseDataSegura(lead.data_agendamento);
      const msMovimentacao = parseDataSegura(lead.data_movimentacao || lead.ultima_interacao);

      // Converte cada data para YYYY-MM-DD no fuso de São Paulo
      const dateCreatedSP = msCreated > 0 ? new Date(msCreated).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : '';
      const dateAgendamentoSP = msAgendamento > 0 ? new Date(msAgendamento).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : '';
      const dateMovimentacaoSP = msMovimentacao > 0 ? new Date(msMovimentacao).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }) : '';

      // FILTRO: HOJE
      if (selectedPeriod === 'Hoje' || selectedPeriod === 'hoje') {
        return dateCreatedSP === spNowStr || dateAgendamentoSP === spNowStr || dateMovimentacaoSP === spNowStr;
      }

      // FILTRO: ONTEM
      if (selectedPeriod === 'Ontem') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdaySPStr = yesterday.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        return dateCreatedSP === yesterdaySPStr || dateAgendamentoSP === yesterdaySPStr || dateMovimentacaoSP === yesterdaySPStr;
      }

      // FILTRO: ÚLTIMOS 7 DIAS
      if (selectedPeriod === 'Últimos 7 dias') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoSPStr = sevenDaysAgo.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        
        const isCreatedRecent = dateCreatedSP >= sevenDaysAgoSPStr && dateCreatedSP <= spNowStr;
        const isAgendadoRecent = dateAgendamentoSP >= sevenDaysAgoSPStr && dateAgendamentoSP <= spNowStr;
        const isMovimentadoRecent = dateMovimentacaoSP >= sevenDaysAgoSPStr && dateMovimentacaoSP <= spNowStr;

        return isCreatedRecent || isAgendadoRecent || isMovimentadoRecent;
      }

      // FILTRO: ESTE MÊS
      if (selectedPeriod === 'Este Mês' || selectedPeriod === 'mes') {
        const currentMonthSP = spNowStr.slice(0, 7); // 'YYYY-MM'
        return (
          dateCreatedSP.slice(0, 7) === currentMonthSP ||
          dateAgendamentoSP.slice(0, 7) === currentMonthSP ||
          dateMovimentacaoSP.slice(0, 7) === currentMonthSP
        );
      }

      return true;
    });
  }, [leads, selectedUnit, selectedPeriod, searchQuery, isAdmin, userUnidade]);

  return filteredLeads;
}