require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const https = require('https');
const fs = require('fs');

const TOKEN = process.env.TOKEN;
if (!TOKEN) return console.log('❌ COLOQUE O TOKEN NAS VARIÁVEIS!');

const PREFIXO = '.';
const ID_SERVIDOR = '1455231465645281365';
const ID_CANAL_RANKING = '1515247489542783007';
const ID_MENSAGEM_IMPORTAR = '1524302877747576853';
const ID_CARGO_ALVO = '1455231465808855296';
const NOME_ATENDIMENTO = '⚒️ SUPORTE EM ATENDIMENTO (THIAGO)';
const ID_ESPECIAL_THIAGO = '1259563127737946234'; // Apenas esse ID tem a mensagem especial
const ARQUIVO_DADOS = 'dados_bot.json';

const client = new Client({
    checkUpdate: false,
    intents: ['Guilds', 'GuildMessages', 'MessageContent']
});

let sistemaMensagemAtivo = false;
let canaisJaAvisados = new Set();
let usuariosRenomeio = new Map();
let canaisJaRenomeados = new Map();
let contadorTickets = {};
let SEU_ID = null;

// ✅ CARREGAMENTO DE DADOS
function carregarDados() {
    try {
        if (fs.existsSync(ARQUIVO_DADOS)) {
            const dados = JSON.parse(fs.readFileSync(ARQUIVO_DADOS, 'utf8'));
            if (dados.usuariosRenomeio) usuariosRenomeio = new Map(Object.entries(dados.usuariosRenomeio));
            if (dados.contadorTickets) contadorTickets = dados.contadorTickets;
            console.log(`\n📂 Dados carregados: ${Object.keys(contadorTickets).length} usuários`);
        }
    } catch(e) {
        console.log(`⚠️ Nenhum arquivo salvo encontrado`);
    }
}

function salvarDados() {
    const dados = {
        usuariosRenomeio: Object.fromEntries(usuariosRenomeio),
        contadorTickets: contadorTickets
    };
    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(dados, null, 2));
}

// ✅ FUNÇÃO DE LEITURA DO RANKING — REUTILIZÁVEL E AUTOMÁTICA
async function lerEAtualizarRanking() {
    try {
        console.log(`\n🔄 Atualizando contadores do ranking...`);
        const servidor = await client.guilds.fetch(ID_SERVIDOR);
        if (!servidor) return;

        let canal = null;
        try { canal = await servidor.channels.fetch(ID_CANAL_RANKING); }
        catch { canal = servidor.channels.cache.find(c => c.type === 0 && c.name.includes('ranking')); }
        if (!canal) return;

        let mensagem = null;
        try { mensagem = await canal.messages.fetch(ID_MENSAGEM_IMPORTAR); }
        catch { const msgs = await canal.messages.fetch({limit:10}); mensagem = msgs.first(); }
        if (!mensagem) return;

        let textoTotal = mensagem.content + '\n';
        for (const embed of mensagem.embeds) {
            textoTotal += (embed.title || '') + '\n' + (embed.description || '') + '\n';
            if (embed.fields) embed.fields.forEach(f => textoTotal += `${f.name} ${f.value}\n`);
        }

        const regex = /`(\d{15,21})`:\s*`(\d{1,4})`/g;
        let match;
        let atualizados = 0;
        while ((match = regex.exec(textoTotal)) !== null) {
            const idUsuario = match[1];
            const novaQtd = parseInt(match[2]);
            if (contadorTickets[idUsuario] !== novaQtd) {
                contadorTickets[idUsuario] = novaQtd;
                atualizados++;
            }
        }

        if (atualizados > 0) {
            salvarDados();
            console.log(`✅ ${atualizados} valores atualizados automaticamente!`);
        } else {
            console.log(`ℹ️ Nenhuma alteração detectada no ranking`);
        }

    } catch(e) {
        console.log(`⚠️ Erro na atualização automática: ${e.message}`);
    }
}

async function reagirSeguro(msg, emoji) {
    try { await msg.react(emoji); } catch {}
}

async function clicarBotao(mensagem, idBotao) {
    const corpo = JSON.stringify({
        type: 3, nonce: Date.now().toString(),
        guild_id: mensagem.guildId, channel_id: mensagem.channelId, message_id: mensagem.id,
        application_id: mensagem.author.id, session_id: client.sessionId,
        data: { component_type: 2, custom_id: idBotao }
    });
    const opcoes = { hostname: 'discord.com', port: 443, path: '/api/v10/interactions', method: 'POST',
        headers: { 'Authorization': TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } };
    try { await new Promise((res, rej) => { const req = https.request(opcoes, r => res(r.statusCode)); req.on('error', rej); req.write(corpo); req.end(); }); } catch {}
    await new Promise(r => setTimeout(r, 800));
}

// ==============================================
// COMANDOS
// ==============================================
client.on('messageCreate', async (msg) => {
    if (!msg.guild || !msg.content.startsWith(PREFIXO)) return;
    const args = msg.content.slice(PREFIXO.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // ✅ .id — PARA TODOS
    if (cmd === 'id') {
        const alvo = msg.mentions.users.first();
        const nome = args.slice(1).join(' ');
        if (!alvo || !nome) return;
        if (usuariosRenomeio.has(alvo.id)) { try { await msg.edit(`usuario ja registrado`); } catch { await msg.channel.send(`usuario ja registrado`); } return; }
        usuariosRenomeio.set(alvo.id, nome);
        contadorTickets[alvo.id] = (contadorTickets[alvo.id] || 0) + 1;
        salvarDados();
        try { await msg.edit(`<:certinho_void:1475619738821333045>`); } catch { await msg.channel.send(`<:certinho_void:1475619738821333045>`); }
        return;
    }

    // ✅ .r — PARA TODOS
    if (cmd === 'r') {
        const novo = args.join(' ');
        if (!novo) { await reagirSeguro(msg, '❌'); return; }
        try { await msg.channel.setName(novo); canaisJaRenomeados.delete(msg.channel.id); await reagirSeguro(msg, '✅'); }
        catch { await reagirSeguro(msg, '❌'); }
        return;
    }

    // ✅ .assumidos — FORMATOS EXATOS COMO PEDIU
    if (cmd === 'assumidos') {
        const alvo = msg.mentions.users.first() || msg.author;
        const qtd = contadorTickets[alvo.id] || 0;
        let texto;

        // Apenas para o ID do Thiago
        if (alvo.id === ID_ESPECIAL_THIAGO) {
            texto = `Olá melhor auxiliar da org! aqui está seu ranking BB!\n1. ${alvo} [numero ${qtd}]`;
        }
        // Para todas as outras pessoas
        else {
            texto = `Olá! aqui esta seu ranking:\n1. ${alvo} [${qtd}]`;
        }

        try { await msg.edit(texto); } catch { await msg.channel.send(texto); }
        return;
    }

    // ✅ COMANDOS RESTRITOS A VOCÊ
    if (msg.author.id !== SEU_ID) return;
    if (cmd === 'add') { const u = msg.mentions.users.first(), q=parseInt(args[1]); if(u&&q>0){ contadorTickets[u.id]=(contadorTickets[u.id]||0)+q; salvarDados(); } try{await msg.delete()}catch{} return; }
    if (cmd === 'rem') { const u = msg.mentions.users.first(), q=parseInt(args[1]); if(u&&q>0){ contadorTickets[u.id]=Math.max(0,(contadorTickets[u.id]||0)-q); salvarDados(); } try{await msg.delete()}catch{} return; }
    if (cmd === 'reset') { contadorTickets={}; salvarDados(); try{await msg.delete()}catch{} return; }
    if (cmd === 'ativar') { sistemaMensagemAtivo=true; canaisJaAvisados.clear(); try{await msg.delete()}catch{} return; }
    if (cmd === 'parar') { sistemaMensagemAtivo=false; try{await msg.delete()}catch{} return; }
    if (cmd === 'aa') { try{await msg.delete()}catch{} const msgs=await msg.channel.messages.fetch({limit:100}); const b=msgs.sort((a,b)=>a.createdTimestamp-b.createdTimestamp).find(m=>m.components?.length>0); if(b){ await clicarBotao(b,'assumir'); await new Promise(r=>setTimeout(r,2000)); await clicarBotao(b,'finalizar'); } return; }
});

// ✅ ATUALIZAÇÃO AUTOMÁTICA QUANDO A MENSAGEM DO RANKING FOR ALTERADA
client.on('messageUpdate', async (msgAntiga, msgNova) => {
    // Se for a mensagem do ranking, atualiza os contadores imediatamente
    if (msgNova.guildId === ID_SERVIDOR && msgNova.channelId === ID_CANAL_RANKING && msgNova.id === ID_MENSAGEM_IMPORTAR) {
        console.log(`📢 Detecção: mensagem do ranking foi alterada!`);
        await lerEAtualizarRanking();
    }
});

// ✅ AÇÃO AUTOMÁTICA — SÓ O PRIMEIRO REGISTRADO
client.on('messageCreate', async (m) => {
    const idCanal = m.channel.id;
    const nome = usuariosRenomeio.get(m.author.id);
    if (nome && m.content.trim() === `Boa Tarde Jogador (a), Como Posso Lhe Ajudar?` && !canaisJaRenomeados.has(idCanal)) {
        try { await m.channel.setName(nome); canaisJaRenomeados.set(idCanal,m.author.id); contadorTickets[m.author.id]=(contadorTickets[m.author.id]||0)+1; salvarDados(); } catch {}
        return;
    }
    if (!sistemaMensagemAtivo || !m.guild || !m.content.includes(ID_CARGO_ALVO) || canaisJaAvisados.has(idCanal)) return;
    canaisJaAvisados.add(idCanal);
    try { await m.channel.send(`Boa Tarde Jogador (a), Como Posso Lhe Ajudar?`); await new Promise(r=>setTimeout(r,300)); await m.channel.setName(NOME_ATENDIMENTO); } catch {}
});

// ✅ INICIO
client.on('ready', async () => {
    SEU_ID = client.user.id;
    carregarDados();
    await lerEAtualizarRanking(); // Primeira carga
    console.log(`\n✅ BOT LOGADO: ${client.user.tag}`);
    console.log(`🚀 Atualização automática do ranking ATIVA!`);
});

client.login(TOKEN).catch(e => console.log(`❌ LOGIN: ${e.message}`));