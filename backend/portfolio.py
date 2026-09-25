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
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Image,PageBreak,Table,TableStyle,KeepTogether,Flowable
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
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
INK=HexColor('#232729');MUTE=HexColor('#666666');PALE=HexColor('#f3f2ef');LINE=HexColor('#d8d8d4')
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
  size=(1400,round(1400*height/CW))
  contained=ImageOps.contain(source,size,method=PILImage.Resampling.LANCZOS)
  image=PILImage.new('RGB',size,'#f3f2ef');image.paste(contained,((size[0]-contained.width)//2,(size[1]-contained.height)//2))
  out=BytesIO();image.save(out,format='JPEG',quality=88,optimize=True);out.seek(0)
  return Image(out,width=CW,height=height)

class ProjectQR(Flowable):
 def __init__(self,url):
  Flowable.__init__(self);self.width=self.height=66;self.url=url
 def draw(self):
  code=QrCodeWidget(self.url);x,y,w,h=code.getBounds();size=60
  drawing=Drawing(size,size,transform=[size/(w-x),0,0,size/(h-y),0,0]);drawing.add(code)
  renderPDF.draw(drawing,self.canv,3,3);self.canv.linkURL(self.url,(0,0,66,66),relative=1)

def render(job):
 projects=job['projects'];s=job['settings'];recipient=job.get('recipient','');result=BytesIO()
 sources=json.loads((ROOT/'source/photo-sources.json').read_text())['photos']
 credits={r['asset'][:-5]:r['credit'] for r in sources}
 def credit(p):
  return para('Фото: '+credits[p['images'][0]],'small') if p['images'] and p['images'][0] in credits else Spacer(1,3)
 def page(c,doc):
  c.saveState();c.setFillColor(INK);c.setFont('FacadeBold',17);c.drawString(M,H-37,'ФАСАД.PRO');c.setFillColor(MUTE);c.setFont('Facade',7);c.drawRightString(W-M,H-34,'ФАСАДЫ ЛЮБОЙ СЛОЖНОСТИ')
  c.setStrokeColor(LINE);c.line(M,H-51,W-M,H-51);c.line(M,43,W-M,43);c.setFont('Facade',7);c.drawString(M,29,s['email']);c.drawCentredString(W/2,29,s['phone']);c.drawRightString(W-M,29,f'{doc.page:02}');c.restoreState()
 doc=SimpleDocTemplate(result,pagesize=A4,rightMargin=M,leftMargin=M,topMargin=78,bottomMargin=61,title='ФАСАД.PRO - портфолио проектов',author='ФАСАД.PRO',pageCompression=1)
 story=[para('ПОРТФОЛИО ПРОЕКТОВ / 2026','kicker'),para(s['slogan'],'title')]
 if recipient:story+=[para(recipient,'large')]
 story += [Spacer(1,8),*([picture(projects[0]['images'][0],265),Spacer(1,8),credit(projects[0])] if projects[0]['images'] else []),Spacer(1,22),para('Архитектура. Наше участие.','large'),para(f"В подборке: {len(projects)} объектов. Остекление, монтаж и восстановление фасадов. Состав и период участия — на страницах проектов.",'body'),para(s['phone']+'  ·  '+s['email'],'small'),PageBreak()]
 for index,p in enumerate(projects):
  if not re.fullmatch(r'[a-z0-9-]+',p['id']):raise ValueError('Invalid project id')
  url='https://facadepro.ru/projects/'+p['id']+'.html'
  story += [para(f"{index+1:02} / {p['type'].upper()}",'kicker'),para(p['title'],'project'),para(p['location'],'small'),Spacer(1,6),*([picture(p['images'][0],235),Spacer(1,8),credit(p)] if p['images'] else [para('Проект представлен составом выполненных работ.','small')]),Spacer(1,12)]
  facts=[['Объём / участие',p['volume']],['Период / срок',p['period']]]
  if p.get('client'):facts.append(['Заказчик',p['client']])
  table=Table([[para(label,'label'),para(value,'fact')] for label,value in facts],colWidths=[125,CW-125],hAlign='LEFT')
  table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LINEABOVE',(0,0),(-1,-1),.5,LINE),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
  story += [table,Spacer(1,16),para('НАШЕ УЧАСТИЕ','kicker'),para(p['work'])]
  link=Paragraph('<b>Фотографии и подробности</b><br/>Сканируйте QR-код или откройте '+f'<link href="{url}" color="#252525"><u>страницу проекта</u></link>.',styles['small'])
  qr=Table([[ProjectQR(url),link]],colWidths=[85,CW-85]);qr.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),0),('BACKGROUND',(0,0),(-1,-1),PALE),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
  story += [KeepTogether([Spacer(1,10),qr]),PageBreak()]
 story += [para('ОБСУДИМ ВАШ ПРОЕКТ','kicker'),para('Начнём<br/>с вашей задачи.'.replace('<br/>','\n'),'title'),Spacer(1,22),para('Ваш менеджер','kicker'),para(s['manager'],'project'),para(s['phone'],'large'),para(s['email'],'large'),Spacer(1,30),para('Владивосток','kicker'),para(s['vladivostok'],'body'),Spacer(1,15),para('Москва','kicker'),para(s['moscow'],'body'),Spacer(1,30),para(s['legalName'],'small'),para(f'ИНН {s["inn"]}  ·  КПП {s["kpp"]}','small'),para('facadepro.ru','large')]
 doc.build(story,onFirstPage=page,onLaterPages=page)
 return result.getvalue()

if __name__=='__main__':
 job=json.load(sys.stdin)
 if not 1<=len(job.get('projects',[]))<=20:raise ValueError('Select 1 to 20 projects')
 sys.stdout.buffer.write(render(job))
