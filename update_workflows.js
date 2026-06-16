const fs = require('fs');
const path = require('path');
const d = '.github/workflows';
const files = fs.readdirSync(d).filter(f => f.endsWith('.yml'));
const suffix = '\n      - name: Notificar GChat (Sucesso)\n' +
               '        if: success()\n' +
               '        run: |\n' +
               '          curl -H "Content-Type: application/json" -d "{\\"text\\": \\"✅ *${{ github.workflow }}* finalizou a execução com sucesso!\\"}" ${{ secrets.GCHAT_WEBHOOK_URL }}\n' +
               '      - name: Notificar GChat (Erro)\n' +
               '        if: failure()\n' +
               '        run: |\n' +
               '          curl -H "Content-Type: application/json" -d "{\\"text\\": \\"❌ *${{ github.workflow }}* falhou! Verifique os logs no GitHub Actions.\\"}" ${{ secrets.GCHAT_WEBHOOK_URL }}\n';
for (const f of files) {
  const p = path.join(d, f);
  let content = fs.readFileSync(p, 'utf8');
  if (!content.includes('Notificar GChat')) {
    fs.writeFileSync(p, content + suffix);
    console.log('Updated ' + f);
  }
}
