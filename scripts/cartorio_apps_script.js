// TRK Imoveis - Cartorio: envia e recebe e-mail do 2o Oficio
// Cole este arquivo inteiro no Google Apps Script (script.google.com)

var WEBHOOK_URL    = 'https://SEU-APP.vercel.app/api/cartorio/inbound';
var WEBHOOK_TOKEN  = '2f68948e90f9bca3f205eb15ca86cde0124c45be22d08a3b7996e0021bccd067';
var APPS_SECRET    = 'trk-cartorio-2024';
var CARTORIO_EMAIL = 'certidao.onus@2ridf.com.br';
var LABEL_NOME     = 'Cartorio/Processado';

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

// Roda a cada 5 min para RECEBER respostas do cartorio
function verificarRespostas() {
  var label = getOuCriarLabel(LABEL_NOME);
  var busca = 'from:' + CARTORIO_EMAIL + ' -label:' + LABEL_NOME;
  var threads = GmailApp.search(busca, 0, 20);

  if (threads.length === 0) return;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msgs = thread.getMessages();
    var msg  = msgs[msgs.length - 1];

    var payload = JSON.stringify({
      from:    msg.getFrom(),
      subject: msg.getSubject(),
      text:    msg.getPlainBody()
    });

    try {
      var res = UrlFetchApp.fetch(WEBHOOK_URL + '?token=' + WEBHOOK_TOKEN, {
        method: 'post',
        contentType: 'application/json',
        payload: payload,
        muteHttpExceptions: true
      });

      var code = res.getResponseCode();
      var body = JSON.parse(res.getContentText());

      if (code === 200) {
        thread.addLabel(label);
        thread.markRead();
        Logger.log('OK: ' + msg.getSubject() + ' | casadas=' + body.matched + ' | cards=' + body.cardsCriados);
      } else {
        Logger.log('ERRO ' + code + ': ' + res.getContentText());
      }
    } catch (err) {
      Logger.log('Excecao: ' + err.toString());
    }
  }
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

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
