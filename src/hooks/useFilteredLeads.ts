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
      // 1. Filtro de Unidade / Permissões
      const leadUnit = lead.unidade || lead.unit || 'Sem Unidade';
      if (!isAdmin && userUnidade && userUnidade !== 'Todas') {
        if (leadUnit.toLowerCase() !== userUnidade.toLowerCase()) return false;
      }
      if (selectedUnit && selectedUnit !== 'Todas as Unidades' && selectedUnit !== 'Todas') {
        if (leadUnit.toLowerCase() !== selectedUnit.toLowerCase()) return false;
      }

      // 2. Filtro de Pesquisa (Nome ou Telefone)
      if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const name = (lead.name || lead.nome || '').toLowerCase();
        const phone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
        const rawPhone = (lead.phone || lead.phone_number || '').toLowerCase();
        if (!name.includes(query) && !phone.includes(query) && !rawPhone.includes(query)) {
          return false;
        }
      }

      // 3. Filtro Determinístico de Período (Fuso Horário de São Paulo)
      const rawDate = lead['última_interação'] || lead.ultima_interacao || lead.created_at;
      const ms = parseDataSegura(rawDate);
      if (ms === 0 && selectedPeriod !== 'Todo o Período') return false;

      const leadDateSP = new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

      if (selectedPeriod === 'Hoje') {
        return leadDateSP === spNowStr;
      }

      if (selectedPeriod === 'Ontem') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdaySPStr = yesterday.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        return leadDateSP === yesterdaySPStr;
      }

      if (selectedPeriod === 'Últimos 7 dias') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoSPStr = sevenDaysAgo.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
        return leadDateSP >= sevenDaysAgoSPStr && leadDateSP <= spNowStr;
      }

      if (selectedPeriod === 'Este Mês') {
        const currentMonthSP = spNowStr.slice(0, 7); // 'YYYY-MM'
        const leadMonthSP = leadDateSP.slice(0, 7);
        return leadMonthSP === currentMonthSP;
      }

      return true; // 'Todo o Período'
    });
  }, [leads, selectedUnit, selectedPeriod, searchQuery, isAdmin, userUnidade]);

  return filteredLeads;
}