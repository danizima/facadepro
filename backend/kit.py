"""Ephemeral contractor ZIP. Only server-selected public materials are accepted."""
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone
import json
import re
import sys
from zipfile import ZipFile, ZIP_DEFLATED
from portfolio import (render, para, ROOT, DATA, W, H, M, CW, INK, MUTE, LINE,
                       SimpleDocTemplate, Table, TableStyle, Spacer, white)


def profile_pdf(job):
    result = BytesIO()
    s = job['settings']
    profile = json.loads((ROOT/'source/company-profile.json').read_text())

    def frame(c, doc):
        c.saveState()
        c.setFillColor(INK); c.rect(0, H-53, W, 53, fill=1, stroke=0)
        c.setFillColor(white); c.setFont('FacadeBold', 17); c.drawString(M, H-34, 'ФАСАД.PRO')
        c.setStrokeColor(LINE); c.line(M, 43, W-M, 43)
        c.setFillColor(MUTE); c.setFont('Facade', 7)
        c.drawString(M, 29, 'facadepro.ru')
        c.drawRightString(W-M, 29, f'Сформировано {job["date"]} / {doc.page:02}')
        c.restoreState()

    doc = SimpleDocTemplate(result, pagesize=(W,H), leftMargin=M, rightMargin=M,
                            topMargin=78, bottomMargin=61, title='ФАСАД.PRO - карточка компании', author='ФАСАД.PRO')
    story = [para('ДЛЯ ЗНАКОМСТВА И ПОДГОТОВКИ ПРЕДЛОЖЕНИЯ','kicker'),
             para('Карточка компании','project'), para(s['legalName'],'large')]
    rows = [('ИНН / КПП',s['inn']+' / '+s['kpp']),('Офис во Владивостоке',s['vladivostok']),
            ('Офис в Москве',s['moscow']),('Ваш менеджер',s['manager']),
            ('Телефон',s['phone']),('Электронная почта',s['email'])]
    table=Table([[para(k,'label'),para(v,'fact')] for k,v in rows], colWidths=[145,CW-145])
    table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEABOVE',(0,0),(-1,-1),.5,LINE),
                              ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),10),
                              ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
    story += [table,Spacer(1,24),para('КОМАНДА И ТЕХНИКА','kicker')]
    resources=Table([[para(r['value'],'project') for r in profile['resources']],
                     [para(r['label'],'small') for r in profile['resources']]],colWidths=[CW/3]*3)
    resources.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),
                                  ('RIGHTPADDING',(0,0),(-1,-1),16)]))
    story += [resources,Spacer(1,12),para('В команде: '+', '.join(profile['specialists'])+'.','small'),
              para(profile['note'],'small')]
    doc.build(story,onFirstPage=frame,onLaterPages=frame)
    return result.getvalue()


def render_kit(job):
    result=BytesIO(); entries=[]; total=0
    def put(archive,name,data,title):
        nonlocal total
        total+=len(data)
        if total>48*1024*1024: raise ValueError('Package too large')
        archive.writestr(name,data);entries.append((name,title))
    job['date']=datetime.now(timezone.utc).strftime('%d.%m.%Y')
    with ZipFile(result,'w',compression=ZIP_DEFLATED,compresslevel=5) as archive:
        if job['profile']:put(archive,'01_Карточка_компании.pdf',profile_pdf(job),'Реквизиты, контакты, команда и техника')
        if job['projects']:put(archive,'02_Портфолио.pdf',render(job),'Выбранные проекты: '+', '.join(p['title'] for p in job['projects']))
        for index,document in enumerate(job['documents'],1):
            key=document['file']
            if not re.fullmatch(r'materials/[a-f0-9-]{36}\.pdf',key):raise ValueError('Invalid document')
            file=(DATA/key).resolve()
            if not file.is_relative_to((DATA/'materials').resolve()) or file.stat().st_size>15*1024*1024:raise ValueError('Invalid file')
            data=file.read_bytes()
            if not data.startswith(b'%PDF-'):raise ValueError('Not a PDF')
            put(archive,f'Документы/{index:02}_Документ.pdf',data,document['title'])
        s=job['settings']
        manifest=['ФАСАД.PRO - пакет подрядчика','Сформировано: '+job['date'],'Версия сайта: '+job['version'],'',
                  'Состав пакета:',*['- '+name+': '+title for name,title in entries],'',
                  'Документы и портфолио актуальны на момент формирования.','Другие сведения для проверки подрядчика можно запросить у менеджера.',
                  '',s['manager'],s['phone'],s['email'],'https://facadepro.ru/contractors.html']
        archive.writestr('Состав_пакета.txt','\ufeff'+'\n'.join(manifest))
    return result.getvalue()


if __name__=='__main__':
    sys.stdout.buffer.write(render_kit(json.load(sys.stdin)))
