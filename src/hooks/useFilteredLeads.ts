// File: src/hooks/useFilteredLeads.ts

"use client";

import { useMemo } from 'react';
import { isLeadWithinPeriod } from '../utils/kanbanUtils';

// Normalizador Unicode para busca resiliente (fontes de WhatsApp e acentos)
const normalizarTexto = (texto: string) => {
  return (texto || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

export function useFilteredLeads(
  leads: any[],
  selectedUnit: string,
  selectedPeriod: string,
  searchQuery: string,
  isAdmin: boolean,
  userUnidade: string,
  customStart?: string,
  customEnd?: string
) {
  const filteredLeads = useMemo(() => {
    if (!Array.isArray(leads)) return [];

    return leads.filter((lead) => {
      // 1. FILTRO DE UNIDADE E PERMISSÕES DE ACESSO
      const leadUnit = (lead.unidade || lead.unit || 'Sem Unidade').trim();
      if (!isAdmin && userUnidade && userUnidade !== 'Todas' && userUnidade !== 'all') {
        if (leadUnit.toLowerCase() !== userUnidade.toLowerCase().trim()) return false;
      }
      if (
        selectedUnit &&
        selectedUnit !== 'Todas as Unidades' &&
        selectedUnit !== 'Todas' &&
        selectedUnit !== 'all'
      ) {
        if (leadUnit.toLowerCase() !== selectedUnit.toLowerCase().trim()) return false;
      }

      // 2. FILTRO DE PESQUISA (NOME OU TELEFONE)
      if (searchQuery && searchQuery.trim() !== '') {
        const queryNorm = normalizarTexto(searchQuery);
        const queryNumerico = searchQuery.replace(/\D/g, '');
        const nameNorm = normalizarTexto(lead.name || lead.nome || '');
        const phone = (lead.phone || lead.phone_number || '').replace(/\D/g, '');
        const rawPhone = (lead.phone || lead.phone_number || '').toLowerCase();

        const bateuNome = queryNorm.length > 0 && nameNorm.includes(queryNorm);
        const bateuTelefone =
          (queryNumerico.length > 0 &&
            (phone.includes(queryNumerico) ||
              (queryNumerico.length >= 8 && phone.endsWith(queryNumerico)))) ||
          rawPhone.includes(queryNorm);

        if (!bateuNome && !bateuTelefone) {
          return false;
        }
      }

      // 3. FILTRO DETERMINÍSTICO DE PERÍODO NO FUSO DE SÃO PAULO (America/Sao_Paulo)
      // Cards na coluna 'Tratamento Fechado' (status === 'vendido') são filtrados estritamente pela data_venda
      return isLeadWithinPeriod(lead, selectedPeriod, customStart, customEnd);
    });
  }, [leads, selectedUnit, selectedPeriod, searchQuery, isAdmin, userUnidade, customStart, customEnd]);

  return filteredLeads;
}
