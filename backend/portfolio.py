"""Render an ephemeral, searchable PDF from server-selected public content.

Reads one JSON job on stdin and writes PDF bytes to stdout. No request data is
stored. Project image paths are resolved inside the configured asset roots.
"""
from pathlib import Path
from io import BytesIO
from html import escape
import sys,json,os,re
from PIL import Image as PILImage,ImageOps
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Image,PageBreak,Table,TableStyle,KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor,white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT=Path(__file__).resolve().parent.parent
DATA=Path(os.environ.get('DATA_DIR',str(ROOT/'data'))).resolve()
FONT=Path(os.environ.get('PDF_FONT_DIR',str(ROOT/'backend/fonts')))
pdfmetrics.registerFont(TTFont('Facade',str(FONT/'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('FacadeBold',str(FONT/'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFontFamily('Facade',normal='Facade',bold='FacadeBold',italic='Facade',boldItalic='FacadeBold')
INK=HexColor('#232729');MUTE=HexColor('#65767e');PALE=HexColor('#eaf0f2');LINE=HexColor('#d1dce2')
W,H=A4;M=42;CW=W-M*2
styles={
 'title':ParagraphStyle('title',fontName='Facade',fontSize=34,leading=38,textColor=INK,spaceAfter=20),
 'project':ParagraphStyle('project',fontName='Facade',fontSize=25,leading=30,textColor=INK,spaceAfter=12),
 'kicker':ParagraphStyle('kicker',fontName='Facade',fontSize=8,leading=12,textColor=MUTE,spaceAfter=14),
 'body':ParagraphStyle('body',fontName='Facade',fontSize=11,leading=17,textColor=INK,spaceAfter=13,splitLongWords=True),
 'large':ParagraphStyle('large',fontName='Facade',fontSize=15,leading=22,textColor=INK,spaceAfter=17),
 'small':ParagraphStyle('small',fontName='Facade',fontSize=9,leading=14,textColor=MUTE,spaceAfter=8,splitLongWords=True),
 'fact':ParagraphStyle('fact',fontName='Facade',fontSize=10,leading=15,textColor=INK),
 'label':ParagraphStyle('label',fontName='Facade',fontSize=8,leading=12,textColor=MUTE),
}
def para(value,style='body'):
 return Paragraph(escape(str(value or '')).replace('\n','<br/>'),styles[style])

def picture(key,height=225):
 if re.fullmatch(r'[a-z0-9-]+',key):path=ROOT/'site/assets'/f'{key}.webp'
 elif re.fullmatch(r'media/[a-f0-9-]+\.(jpg|png|webp)',key):path=DATA/key
 else:raise ValueError('Invalid image key')
 with PILImage.open(path) as source:
  source=ImageOps.exif_transpose(source).convert('RGB')
  image=ImageOps.fit(source,(1500,round(1500*height/CW)),method=PILImage.Resampling.LANCZOS)
  out=BytesIO();image.save(out,format='JPEG',quality=88,optimize=True);out.seek(0)
  return Image(out,width=CW,height=height)

def render(job):
 projects=job['projects'];s=job['settings'];recipient=job.get('recipient','');result=BytesIO()
 def page(c,doc):
  c.saveState();c.setFillColor(INK);c.rect(0,H-53,W,53,fill=1,stroke=0);c.setFillColor(white);c.setFont('FacadeBold',17);c.drawString(M,H-34,'ФАСАД.PRO');c.setFont('Facade',7);c.drawRightString(W-M,H-31,'ФАСАДЫ ЛЮБОЙ СЛОЖНОСТИ')
  c.setStrokeColor(LINE);c.line(M,43,W-M,43);c.setFillColor(MUTE);c.setFont('Facade',7);c.drawString(M,29,s['email']);c.drawCentredString(W/2,29,s['phone']);c.drawRightString(W-M,29,f'{doc.page:02}');c.restoreState()
 doc=SimpleDocTemplate(result,pagesize=A4,rightMargin=M,leftMargin=M,topMargin=78,bottomMargin=61,title='ФАСАД.PRO - персональное портфолио',author='ФАСАД.PRO',pageCompression=1)
 story=[para('ПЕРСОНАЛЬНОЕ ПОРТФОЛИО','kicker'),para(s['slogan'],'title')]
 if recipient:story+=[para(recipient,'large')]
 story += [Spacer(1,8),*([picture(projects[0]['images'][0],235)] if projects[0]['images'] else []),Spacer(1,25),para(f'Объектов в подборке: {len(projects)}','kicker'),para('Опыт, который можно увидеть.','large'),para('Подборка выполненных и действующих проектов. Состав и период нашего участия указаны на страницах объектов.','body'),Spacer(1,14),para(s['manager'],'large'),para(s['phone']+'  ·  '+s['email'],'small'),PageBreak()]
 for p in projects:
  story += [para(p['type'].upper(),'kicker'),para(p['title'],'project'),para(p['location'],'small'),Spacer(1,10),*([picture(p['images'][0])] if p['images'] else []),Spacer(1,20)]
  facts=[['Объём / участие',p['volume']],['Период / срок',p['period']]]
  if p.get('client'):facts.append(['Заказчик',p['client']])
  table=Table([[para(label,'label'),para(value,'fact')] for label,value in facts],colWidths=[125,CW-125],hAlign='LEFT')
  table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEABOVE',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
  story += [table,Spacer(1,20),para('НАШЕ УЧАСТИЕ','kicker'),para(p['work'])]
  # Extra case paragraphs flow naturally if a manager adds long text.
  for key,label in [('challenge','ОСОБЕННОСТИ ОБЪЕКТА'),('solution','ПОДХОД К РАБОТАМ')]:
   if p.get('case',{}).get(key):story += [KeepTogether([Spacer(1,7),para(label,'kicker'),para(p['case'][key])])]
  story.append(PageBreak())
 story += [para('ОБСУДИМ ВАШ ПРОЕКТ','kicker'),para('Начнём\nс вашей задачи.','title'),Spacer(1,22),para('Ваш менеджер','kicker'),para(s['manager'],'project'),para(s['phone'],'large'),para(s['email'],'large'),Spacer(1,35),para('Владивосток','kicker'),para(s['vladivostok'],'body'),Spacer(1,15),para('Москва','kicker'),para(s['moscow'],'body'),Spacer(1,35),para(s['legalName'],'small'),para(f'ИНН {s["inn"]}  ·  КПП {s["kpp"]}','small'),para('facadepro.ru','large')]
 doc.build(story,onFirstPage=page,onLaterPages=page)
 return result.getvalue()

if __name__=='__main__':
 job=json.load(sys.stdin)
 if not 1<=len(job.get('projects',[]))<=20:raise ValueError('Select 1 to 20 projects')
 sys.stdout.buffer.write(render(job))
