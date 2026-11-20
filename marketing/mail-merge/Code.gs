/**
 * Crystal Clean — sends the hotel offer from your own Gmail, a few dozen a day.
 *
 * Sheet "Hotels" (row 1 = headers):
 *   A Hotel | B Email | C District | D Source | E Status | F SentAt | G FollowUpAt | H Note
 * Leave Status empty for rows to send. The script fills Status / SentAt / FollowUpAt.
 * Set Status to "გაუწერა" (unsubscribed) by hand for anyone who asks not to be contacted.
 */

// ===================== SETTINGS =====================
const CONFIG = {
  SHEET_NAME: 'Hotels',
  PDF_FILE_ID: 'PASTE_DRIVE_FILE_ID_HERE',   // the offer PDF uploaded to Google Drive
  DAILY_LIMIT: 30,                            // raise slowly: 30 → 50 → 70 (Gmail allows ~100/day)
  FOLLOW_UP_AFTER_DAYS: 4,
  SENDER_NAME: 'Crystal Clean Tbilisi',
  PHONE: '+995 500 500 256',
  PHONE_LINK: 'tel:+995500500256',
  WHATSAPP_LINK: 'https://wa.me/995500500256?text=' +
      encodeURIComponent('გამარჯობა! სასტუმროსთვის შეთავაზება მაინტერესებს.'),
  WEBSITE: 'https://rezogvelesiani.github.io/crystal-clean/',
  BANNER: 'https://rezogvelesiani.github.io/crystal-clean/assets/og-image.jpg',
  SIGNATURE_NAME: 'PASTE_YOUR_NAME_HERE',
};

const COL = { HOTEL: 1, EMAIL: 2, DISTRICT: 3, SOURCE: 4, STATUS: 5, SENT: 6, FOLLOW: 7, NOTE: 8 };
const ST = { SENT: 'გაგზავნილია', FOLLOWED: 'მეორე წერილი გაიგზავნა', REPLIED: 'უპასუხა',
             UNSUB: 'გაუწერა', ERROR: 'შეცდომა', BAD: 'არასწორი მეილი', DUP: 'დუბლიკატი' };

// ===================== MENU =====================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📨 Crystal Clean')
    .addItem('1 · სატესტო მეილი ჩემთვის', 'sendTestToMe')
    .addItem('2 · დღევანდელი პარტიის გაგზავნა', 'sendBatch')
    .addItem('3 · მეორე წერილები (ვინც არ უპასუხა)', 'sendFollowUps')
    .addItem('4 · პასუხების შემოწმება', 'markReplies')
    .addSeparator()
    .addItem('ავტომატური გაგზავნა ყოველ დღე — ჩართვა', 'enableDaily')
    .addItem('ავტომატური გაგზავნა — გამორთვა', 'disableDaily')
    .addItem('დღევანდელი ლიმიტის ნახვა', 'showQuota')
    .addToUi();
}

// ===================== E-MAIL CONTENT =====================
function subjectFor(hotel) {
  return hotel
    ? hotel + ' — თეთრეულის რეცხვა + უფასო საცდელი პარტია'
    : 'თეთრეულის რეცხვა თქვენი სასტუმროსთვის + უფასო საცდელი პარტია';
}

function textBody(hotel) {
  const h = hotel ? hotel + '-ს' : 'თქვენს სასტუმროს';
  return [
    'გამარჯობა,',
    '',
    'გწერთ Crystal Clean-იდან — თბილისის პროფესიონალური სამრეცხაოდან. ამჟამად 7 სასტუმროს ვემსახურებით.',
    '',
    h + ' შეგვიძლია შევთავაზოთ თეთრეულის სრული მომსახურება: წაღება, რეცხვა ECOLAB-ის საშუალებებით, ' +
      'გაშრობა, დაუთოება, დაკეცვა, მარკირებული შეფუთვა და დაბრუნება — თქვენს გრაფიკზე, უფასო ტრანსპორტირებით.',
    '',
    'რომ ხარისხი რისკის გარეშე ნახოთ, პირველ საცდელ პარტიას უფასოდ გავრეცხავთ.',
    'დეტალური შეთავაზება თანდართულ PDF-შია.',
    '',
    'შეგვიძლია 10 წუთით შეგხვდეთ ან დაგირეკოთ მოსახერხებელ დროს?',
    '',
    'პატივისცემით,',
    CONFIG.SIGNATURE_NAME,
    'Crystal Clean Tbilisi',
    CONFIG.PHONE + ' (ზარი და WhatsApp)',
    CONFIG.WEBSITE,
    '',
    'თუ არ გსურთ ჩვენგან წერილების მიღება, უბრალოდ გვიპასუხეთ — მეტს აღარ მოგწერთ.',
  ].join('\n');
}

function htmlBody(hotel) {
  const h = hotel ? esc(hotel) + '-ს' : 'თქვენს სასტუმროს';
  const btn = (href, label, bg, fg) =>
    `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 20px;border-radius:999px;` +
    `background:${bg};color:${fg};font-weight:700;text-decoration:none;font-size:15px">${label}</a>`;
  return `
<div style="background:#f3f7f8;padding:24px 12px;font-family:'Noto Sans Georgian',Arial,sans-serif;color:#152a33">
 <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dbe6ea">
  <img src="${CONFIG.BANNER}" width="600" alt="Crystal Clean Tbilisi — პროფესიონალური სამრეცხაო"
       style="display:block;width:100%;height:auto;border:0">
  <div style="padding:28px 28px 8px;font-size:15.5px;line-height:1.65">
   <p style="margin:0 0 14px">გამარჯობა,</p>
   <p style="margin:0 0 14px">გწერთ <b>Crystal Clean</b>-იდან — თბილისის პროფესიონალური სამრეცხაოდან. ამჟამად <b>7 სასტუმროს</b> ვემსახურებით.</p>
   <p style="margin:0 0 14px">${h} შეგვიძლია შევთავაზოთ თეთრეულის სრული მომსახურება:</p>
   <table role="presentation" style="margin:0 0 16px;border-collapse:collapse;font-size:15px">
    ${['წაღება და მიტანა — <b>უფასოდ</b>, თქვენს გრაფიკზე',
       'რეცხვა <b>ECOLAB</b>-ის პროფესიონალური საშუალებებით',
       'გაშრობა, დაუთოება სამრეწველო უთოზე, დაკეცვა',
       'მარკირებული შეფუთვა — ტიპი და რაოდენობა ყველა შეფუთვაზე',
       'დღიური სიმძლავრე <b>1 500 კგ</b> — სეზონის პიკშიც დროულად']
      .map(t => `<tr><td style="padding:3px 10px 3px 0;color:#b8923a;vertical-align:top">✔</td><td style="padding:3px 0">${t}</td></tr>`).join('')}
   </table>
   <div style="margin:0 0 18px;padding:16px 18px;border-radius:12px;background:linear-gradient(135deg,#f6e3a8,#d8b25a);color:#2a1f05">
    <div style="font-size:12px;font-weight:700">სპეციალური შეთავაზება ახალი პარტნიორებისთვის</div>
    <div style="font-size:19px;font-weight:700;margin-top:4px">პირველი საცდელი პარტია — უფასოდ</div>
   </div>
   <p style="margin:0 0 14px">დეტალური შეთავაზება თანდართულ PDF-შია. შეგვიძლია 10 წუთით შეგხვდეთ ან დაგირეკოთ მოსახერხებელ დროს?</p>
   <div style="margin:0 0 20px">
    ${btn(CONFIG.WHATSAPP_LINK, 'მოგვწერეთ WhatsApp-ზე', '#25d366', '#053b1b')}
    ${btn(CONFIG.PHONE_LINK, 'დაგვირეკეთ: ' + CONFIG.PHONE, '#1f6b7a', '#ffffff')}
   </div>
   <p style="margin:0 0 4px">პატივისცემით,<br><b>${esc(CONFIG.SIGNATURE_NAME)}</b><br>Crystal Clean Tbilisi</p>
   <p style="margin:0 0 22px;font-size:14px;color:#4f6670">${CONFIG.PHONE} · <a href="${CONFIG.WEBSITE}" style="color:#1f6b7a">ვებგვერდი</a></p>
  </div>
  <div style="padding:14px 28px;background:#f6f9fa;border-top:1px solid #e3ecef;font-size:12px;color:#7d9299">
   თუ არ გსურთ ჩვენგან წერილების მიღება, უბრალოდ გვიპასუხეთ — მეტს აღარ მოგწერთ.
  </div>
 </div>
</div>`;
}

function followUpText(hotel) {
  return [
    'გამარჯობა,',
    '',
    'მოკლედ გადმოგიმეორებთ ჩვენს შეთავაზებას' + (hotel ? ' ' + hotel + '-სთვის' : '') +
      ': მზად ვართ თქვენი თეთრეულის საცდელი პარტია უფასოდ გავრეცხოთ, რომ ხარისხი თავად ნახოთ.',
    'როდის იქნება მოსახერხებელი 5-წუთიანი ზარი?',
    '',
    CONFIG.SIGNATURE_NAME + ', Crystal Clean Tbilisi',
    CONFIG.PHONE + ' (ზარი და WhatsApp)',
    '',
    'თუ არ გსურთ ჩვენგან წერილების მიღება, უბრალოდ გვიპასუხეთ.',
  ].join('\n');
}

// ===================== ACTIONS =====================
function sendTestToMe() {
  checkSettings_();
  const me = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(me, '[ტესტი] ' + subjectFor('Hotel Example'), textBody('Hotel Example'), {
    htmlBody: htmlBody('Hotel Example'), name: CONFIG.SENDER_NAME, attachments: [pdf_()],
  });
  toast_('სატესტო მეილი გაიგზავნა: ' + me + '. ნახე, როგორ გამოიყურება, მერე გაუშვი პარტია.');
}

function sendBatch() {
  checkSettings_();
  const sh = sheet_();
  const rows = sh.getDataRange().getValues();
  const seen = new Set();
  let limit = Math.min(CONFIG.DAILY_LIMIT, MailApp.getRemainingDailyQuota());
  let sent = 0;
  const attachment = pdf_();
  for (let r = 1; r < rows.length && sent < limit; r++) {
    const hotel = String(rows[r][COL.HOTEL - 1] || '').trim();
    const email = String(rows[r][COL.EMAIL - 1] || '').trim().toLowerCase();
    const status = String(rows[r][COL.STATUS - 1] || '').trim();
    if (!email) continue;
    if (seen.has(email)) { if (!status) setStatus_(sh, r, ST.DUP); continue; }
    seen.add(email);
    if (status) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setStatus_(sh, r, ST.BAD); continue; }
    try {
      GmailApp.sendEmail(email, subjectFor(hotel), textBody(hotel), {
        htmlBody: htmlBody(hotel), name: CONFIG.SENDER_NAME, attachments: [attachment],
      });
      setStatus_(sh, r, ST.SENT);
      sh.getRange(r + 1, COL.SENT).setValue(new Date());
      sent++;
      Utilities.sleep(4000 + Math.floor(Math.random() * 6000)); // 4–10 s between e-mails
    } catch (e) {
      setStatus_(sh, r, ST.ERROR + ': ' + e.message);
    }
  }
  toast_('გაიგზავნა ' + sent + ' მეილი. დღევანდელი დარჩენილი ლიმიტი: ' + MailApp.getRemainingDailyQuota());
}

function sendFollowUps() {
  markReplies();
  const sh = sheet_();
  const rows = sh.getDataRange().getValues();
  const now = new Date();
  let limit = Math.min(CONFIG.DAILY_LIMIT, MailApp.getRemainingDailyQuota());
  let sent = 0;
  for (let r = 1; r < rows.length && sent < limit; r++) {
    const status = String(rows[r][COL.STATUS - 1] || '').trim();
    const sentAt = rows[r][COL.SENT - 1];
    if (status !== ST.SENT || !(sentAt instanceof Date)) continue;
    if ((now - sentAt) / 86400000 < CONFIG.FOLLOW_UP_AFTER_DAYS) continue;
    const hotel = String(rows[r][COL.HOTEL - 1] || '').trim();
    const email = String(rows[r][COL.EMAIL - 1] || '').trim();
    try {
      GmailApp.sendEmail(email, 'Re: ' + subjectFor(hotel), followUpText(hotel), { name: CONFIG.SENDER_NAME });
      setStatus_(sh, r, ST.FOLLOWED);
      sh.getRange(r + 1, COL.FOLLOW).setValue(new Date());
      sent++;
      Utilities.sleep(4000 + Math.floor(Math.random() * 6000));
    } catch (e) {
      setStatus_(sh, r, ST.ERROR + ': ' + e.message);
    }
  }
  toast_('მეორე წერილი გაეგზავნა ' + sent + ' სასტუმროს.');
}

function markReplies() {
  const sh = sheet_();
  const rows = sh.getDataRange().getValues();
  let n = 0;
  for (let r = 1; r < rows.length; r++) {
    const status = String(rows[r][COL.STATUS - 1] || '').trim();
    if (status !== ST.SENT && status !== ST.FOLLOWED) continue;
    const email = String(rows[r][COL.EMAIL - 1] || '').trim();
    if (email && GmailApp.search('from:' + email, 0, 1).length) { setStatus_(sh, r, ST.REPLIED); n++; }
  }
  toast_('ახალი პასუხები: ' + n + '. სტატუსი „' + ST.REPLIED + '“ — მათ დაურეკე ან მისწერე პირადად.');
}

function enableDaily() {
  disableDaily();
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(10).create();
  toast_('ჩართულია: ყოველ დღე ~10:00-ზე გაიგზავნება ' + CONFIG.DAILY_LIMIT + ' მეილი და მეორე წერილები.');
}
function disableDaily() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyRun').forEach(t => ScriptApp.deleteTrigger(t));
}
function dailyRun() { sendBatch(); sendFollowUps(); }
function showQuota() { toast_('Gmail-ის დღევანდელი დარჩენილი ლიმიტი: ' + MailApp.getRemainingDailyQuota()); }

// ===================== HELPERS =====================
function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) throw new Error('ფურცელი „' + CONFIG.SHEET_NAME + '“ ვერ მოიძებნა');
  return sh;
}
function pdf_() { return DriveApp.getFileById(CONFIG.PDF_FILE_ID).getBlob().setName('Crystal-Clean-შეთავაზება.pdf'); }
function setStatus_(sh, r, v) { sh.getRange(r + 1, COL.STATUS).setValue(v); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast_(m) { try { SpreadsheetApp.getActive().toast(m, 'Crystal Clean', 8); } catch (e) { Logger.log(m); } }
function checkSettings_() {
  if (CONFIG.PDF_FILE_ID.indexOf('PASTE') === 0) throw new Error('ჩასვი PDF-ის Drive ID პარამეტრში PDF_FILE_ID');
  if (CONFIG.SIGNATURE_NAME.indexOf('PASTE') === 0) throw new Error('ჩაწერე შენი სახელი პარამეტრში SIGNATURE_NAME');
}
