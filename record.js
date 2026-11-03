const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Menentukan file output target (default: skenario.js)
const outputFile = process.env.OUTPUT_FILE || 'skenario.js';

function startRecording(targetUrl = '') {
  console.log('\n==========================================');
  console.log('       PLAYWRIGHT SCENARIO RECORDER       ');
  console.log('==========================================');
  console.log(`Target URL : ${targetUrl || '(Kosong / Langsung buka browser)'}`);
  console.log(`Output File: ${outputFile}`);
  console.log('------------------------------------------');
  console.log('Petunjuk:');
  console.log('1. Browser dan Playwright Inspector akan terbuka.');
  console.log('2. Lakukan interaksi (klik, ketik, navigasi, dll) di browser.');
  console.log('3. Tindakan Anda akan direkam secara otomatis.');
  console.log('4. Tutup jendela browser jika selesai merekam.');
  console.log('==========================================\n');

  const args = [
    'playwright',
    'codegen',
    '--target=javascript',
    '-o',
    outputFile
  ];

  if (targetUrl) {
    args.push(targetUrl);
  }

  // Gunakan npx untuk memanggil playwright
  const codegenProcess = spawn('npx', args, {
    stdio: 'inherit',
    shell: true
  });

  codegenProcess.on('close', (code) => {
    console.log('\n------------------------------------------');
    if (code === 0) {
      const fullPath = path.resolve(outputFile);
      if (fs.existsSync(fullPath)) {
        console.log(`✅ Perekaman selesai! Skenario tersimpan di: ${outputFile}`);
        console.log(`\nUntuk menjalankan hasil automasi:`);
        console.log(`  node ${outputFile}`);
        console.log(`  atau npm run start`);
      } else {
        console.log('ℹ️ Perekaman dihentikan tanpa perubahan file.');
      }
    } else {
      console.error(`⚠️ Proses ditutup dengan kode keluar: ${code}`);
    }
    console.log('==========================================\n');
  });

  codegenProcess.on('error', (err) => {
    console.error('❌ Gagal menjalankan Playwright Codegen:', err.message);
  });
}

// Cek argumen dari CLI (misal: node record.js https://example.com)
const args = process.argv.slice(2);
const cliUrl = args.find(arg => !arg.startsWith('-'));

if (cliUrl) {
  startRecording(cliUrl);
} else {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Masukkan URL yang ingin direkam (tekan Enter untuk mulai dari halaman kosong): ', (answer) => {
    rl.close();
    let url = answer.trim();
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    startRecording(url);
  });
}
