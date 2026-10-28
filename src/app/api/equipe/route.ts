import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, cargo, unidade, password } = body || {};

    if (!nome?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Nome e E-mail são obrigatórios.' }, { status: 400 });
    }

    const cleanNome = String(nome).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCargo = cargo ? String(cargo).trim() : 'usuario';
    const cleanUnidade = unidade ? String(unidade).trim() : 'Santo André';
    const cleanPassword = password && String(password).trim().length >= 6 
      ? String(password).trim() 
      : 'Dentup@2026';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authHeader = request.headers.get('Authorization');

    // CASO 1: SUPABASE_SERVICE_ROLE_KEY CONFIGURADA (Via Auth Admin)
    if (serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      let userId: string | null = null;

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: { nome: cleanNome, cargo: cleanCargo, unidade: cleanUnidade },
      });

      if (authError) {
        const isAlreadyRegistered = 
          authError.message?.toLowerCase().includes('already registered') ||
          authError.message?.toLowerCase().includes('already exists') ||
          (authError as any).code === 'email_exists';

        if (isAlreadyRegistered) {
          const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userList?.users?.find(u => u.email?.toLowerCase() === cleanEmail);
          if (existingUser?.id) {
            userId = existingUser.id;
          } else {
            return NextResponse.json({ error: 'Usuário já existe no Auth mas não foi possível recuperar o ID.' }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: authError.message }, { status: 400 });
        }
      } else if (authData?.user?.id) {
        userId = authData.user.id;
      }

      if (!userId) {
        return NextResponse.json({ error: 'Falha ao obter ID de autenticação do usuário.' }, { status: 400 });
      }

      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('dentup_profiles')
        .upsert({
          id: userId,
          email: cleanEmail,
          nome: cleanNome,
          cargo: cleanCargo,
          unidade: cleanUnidade,
        }, { onConflict: 'id' })
        .select()
        .single();

      if (profileError) {
        return NextResponse.json({ error: 'Erro ao salvar perfil dentup_profiles: ' + profileError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        user: profileData || { id: userId, email: cleanEmail, nome: cleanNome, cargo: cleanCargo, unidade: cleanUnidade },
      });
    }

    // CASO 2: SEM SERVICE ROLE KEY - Inserção defensiva com ID UUID para não violar not-null
    const directClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    });

    const generatedId = crypto.randomUUID();
    const cleanPayload = {
      id: generatedId,
      email: cleanEmail,
      nome: cleanNome,
      cargo: cleanCargo,
      unidade: cleanUnidade,
    };

    const { data: directData, error: directError } = await directClient
      .from('dentup_profiles')
      .insert([cleanPayload])
      .select()
      .single();

    if (!directError) {
      return NextResponse.json({ success: true, user: directData });
    }

    const isFkeyOrNullError = 
      directError.message?.includes('dentup_profiles_id_fkey') || 
      directError.message?.includes('foreign key') ||
      directError.message?.includes('not-null constraint') ||
      directError.code === '23503' ||
      directError.code === '23502';

    if (isFkeyOrNullError) {
      return NextResponse.json({
        error: 'A tabela dentup_profiles exige um ID de usuário do Supabase Auth. Configure a chave SUPABASE_SERVICE_ROLE_KEY no seu arquivo .env.local para permitir a criação automática de colaboradores no sistema.',
        details: directError.message,
      }, { status: 400 });
    }

    return NextResponse.json({ error: directError.message }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno no servidor' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authHeader = request.headers.get('Authorization');

    const client = createClient(supabaseUrl, serviceRoleKey || anonKey, {
      auth: { persistSession: false },
      global: (!serviceRoleKey && authHeader) ? { headers: { Authorization: authHeader } } : undefined,
    });

    const { data, error } = await client
      .from('dentup_profiles')
      .select('*')
      .order('nome', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno ao consultar equipe' }, { status: 500 });
  }
}

