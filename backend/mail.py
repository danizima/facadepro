"""SMTP worker: message data on stdin, credentials only through environment."""
import json,os,ssl,smtplib,sys
from email.message import EmailMessage
from email.utils import formatdate
try:
 data=json.load(sys.stdin)
 msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=data['to'];msg['Subject']=data['subject'];msg['Date']=formatdate(localtime=False);msg['Message-ID']=data['message_id']
 if data.get('reply_to'):msg['Reply-To']=data['reply_to']
 msg.set_content(data['body'])
 host=os.environ['SMTP_HOST'];mode=os.environ.get('SMTP_SECURITY','starttls');port=int(os.environ.get('SMTP_PORT','465' if mode=='tls' else '587'))
 if mode=='tls':client=smtplib.SMTP_SSL(host,port,timeout=20,context=ssl.create_default_context())
 elif mode=='starttls':
  client=smtplib.SMTP(host,port,timeout=20);client.ehlo();client.starttls(context=ssl.create_default_context());client.ehlo()
 elif mode=='local-test' and host in ('127.0.0.1','localhost') and os.environ.get('NODE_ENV')!='production':client=smtplib.SMTP(host,port,timeout=20)
 else:raise ValueError('Unsupported SMTP security mode')
 with client:
  if os.environ.get('SMTP_USER'):client.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
  refused=client.send_message(msg)
  if refused:raise RuntimeError('SMTP refused recipient')
 print(json.dumps({'ok':True}))
except Exception as exc:
 # Never print server replies or credentials into operational logs.
 print(json.dumps({'ok':False,'error':type(exc).__name__}));sys.exit(1)
