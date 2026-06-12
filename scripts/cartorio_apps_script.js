// TRK Imoveis - Cartorio: envia e recebe e-mail do 2o Oficio
// Cole este arquivo inteiro no Google Apps Script (script.google.com)

var WEBHOOK_URL      = 'https://erp-trk.vercel.app/api/cartorio/inbound';
var ONUS_WEBHOOK_URL = 'https://erp-trk.vercel.app/api/onus/inbound';
var WEBHOOK_TOKEN    = '2f68948e90f9bca3f205eb15ca86cde0124c45be22d08a3b7996e0021bccd067';
var APPS_SECRET      = 'trk-cartorio-2024';
var CARTORIO_EMAIL   = 'certidao.onus@2ridf.com.br';
var LABEL_NOME       = 'Cartorio/Processado';
var MAX_PDF_BYTES    = 3500000; // limite de body da Vercel (~4.5MB) com folga p/ base64

// Chamado pelo Next.js para ENVIAR e-mail ao cartorio
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.secret !== APPS_SECRET) {
      return resposta({ ok: false, error: 'Unauthorized' });
    }
    GmailApp.sendEmail(data.to, data.subject, data.body, {
      name: 'Davi Guedes - TRK Imoveis'
    });
    return resposta({ ok: true });
  } catch (err) {
    return resposta({ ok: false, error: err.toString() });
  }
}

// Roda a cada 5 min para RECEBER respostas do cartorio.
// Rastreia por TIMESTAMP DE MENSAGEM (Script Properties), nao por label de thread:
// assim uma onus que chega como RESPOSTA numa thread ja processada nao e perdida.
// Texto -> /api/cartorio/inbound (matricula). Anexo PDF -> /api/onus/inbound (onus).
function verificarRespostas() {
  var props  = PropertiesService.getScriptProperties();
  // 1a execucao: olha so as ultimas 24h (evita reprocessar a semana inteira)
  var lastTs = Number(props.getProperty('LAST_MSG_TS') || (Date.now() - 86400000));
  var label  = getOuCriarLabel(LABEL_NOME);
  var threads = GmailApp.search('from:' + CARTORIO_EMAIL + ' newer_than:7d', 0, 50);
  var maxTs = lastTs;

  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    var processouAlgo = false;

    for (var j = 0; j < msgs.length; j++) {
      var msg = msgs[j];
      var ts  = msg.getDate().getTime();
      if (ts <= lastTs) continue;                                  // ja processada
      if (msg.getFrom().indexOf(CARTORIO_EMAIL) === -1) continue;  // so msgs DO cartorio

      // 1) texto -> inbound de matricula (comportamento original)
      try {
        var res = UrlFetchApp.fetch(WEBHOOK_URL + '?token=' + WEBHOOK_TOKEN, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            from:    msg.getFrom(),
            subject: msg.getSubject(),
            text:    msg.getPlainBody()
          }),
          muteHttpExceptions: true
        });
        Logger.log('matricula ' + res.getResponseCode() + ': ' + msg.getSubject());
      } catch (err) {
        Logger.log('Excecao matricula: ' + err.toString());
      }

      // 2) anexos PDF -> inbound de onus (um POST por PDF)
      var atts = msg.getAttachments();
      for (var k = 0; k < atts.length; k++) {
        var att = atts[k];
        var ehPdf = String(att.getContentType()).indexOf('pdf') !== -1 ||
                    /\.pdf$/i.test(att.getName());
        if (!ehPdf) continue;
        if (att.getBytes().length > MAX_PDF_BYTES) {
          Logger.log('PDF grande demais, pulado: ' + att.getName());
          continue;
        }
        try {
          var resOnus = UrlFetchApp.fetch(ONUS_WEBHOOK_URL + '?token=' + WEBHOOK_TOKEN, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify({
              from:       msg.getFrom(),
              subject:    msg.getSubject(),
              filename:   att.getName(),
              pdf_base64: Utilities.base64Encode(att.getBytes())
            }),
            muteHttpExceptions: true
          });
          Logger.log('onus ' + resOnus.getResponseCode() + ': ' + att.getName());
        } catch (err2) {
          Logger.log('Excecao onus: ' + err2.toString());
        }
      }

      if (ts > maxTs) maxTs = ts;
      processouAlgo = true;
    }

    if (processouAlgo) {
      threads[i].addLabel(label);  // label vira so marcador visual
      threads[i].markRead();
    }
  }

  if (maxTs > lastTs) props.setProperty('LAST_MSG_TS', String(maxTs));
}

// Rode UMA VEZ para instalar o gatilho de 5 em 5 min
function instalarGatilho() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'verificarRespostas') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('verificarRespostas').timeBased().everyMinutes(5).create();
  Logger.log('Gatilho instalado: verificarRespostas a cada 5 min');
}

function getOuCriarLabel(nome) {
  var label = GmailApp.getUserLabelByName(nome);
  if (!label) label = GmailApp.createLabel(nome);
  return label;
}

// Busca e-mails no Gmail — chamado via GET com ?token=APPS_SECRET&q=query
function doGet(e) {
  var secret = (e.parameter && e.parameter.token) ? e.parameter.token : '';
  if (secret !== APPS_SECRET) {
    return resposta({ error: 'Unauthorized' });
  }
  var q = (e.parameter && e.parameter.q) ? e.parameter.q : 'subject:(onus OR matricula)';
  var threads = GmailApp.search(q, 0, 50);
  var results = [];
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    var last = msgs[msgs.length - 1];
    results.push({
      subject: thread.getFirstMessageSubject(),
      from:    last.getFrom(),
      to:      last.getTo(),
      date:    Utilities.formatDate(last.getDate(), 'America/Sao_Paulo', 'yyyy-MM-dd'),
      body:    last.getPlainBody().slice(0, 300)
    });
  }
  return resposta({ ok: true, count: results.length, emails: results });
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
