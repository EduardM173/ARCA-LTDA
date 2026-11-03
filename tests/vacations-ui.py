from selenium.common.exceptions import StaleElementReferenceException
import json,sys
from pathlib import Path
from datetime import date,timedelta
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait,Select
f=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));o=webdriver.ChromeOptions();o.add_argument('--headless=new');o.add_argument('--disable-gpu');o.add_argument('--disable-extensions');o.add_argument('--renderer-process-limit=1');o.add_argument('--window-size=1280,1000');d=webdriver.Chrome(service=Service(str(Path.home()/'.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe')),options=o);w=WebDriverWait(d,30);today=date.fromisoformat(f['today'])
def button(text,root=None):
 e=w.until(lambda x:(root or d).find_element(By.XPATH,'.//button[normalize-space(.)="'+text+'"]'));d.execute_script('arguments[0].scrollIntoView({block:"center"})',e);e.click()
def fill(root,values):
 for key,value in values.items():
  e=w.until(lambda x:root.find_element(By.NAME,key))
  if e.tag_name=='select':Select(e).select_by_value(value)
  elif e.get_attribute('type')=='date':d.execute_script('arguments[0].value=arguments[1]',e,value)
  else:e.clear();e.send_keys(value)
def form(title):
 if not d.find_elements(By.XPATH,'//form[h3[normalize-space(.)="'+title+'"]]'):d.find_element(By.XPATH,'//button[normalize-space(.)="'+title+'"]').click()
 return w.until(lambda x:x.find_element(By.XPATH,'//form[h3[normalize-space(.)="'+title+'"]]'))
def employee():
 def choose(x):
  try:
   e=x.find_element(By.XPATH,'//label[normalize-space(text())="Funcionario"]/select');Select(e).select_by_value(f['employeeId']);return e.get_attribute('value')==f['employeeId']
  except Exception:return False
 w.until(choose)
def login(index):
 d.get(f['base']);w.until(lambda x:x.find_element(By.NAME,'email'));fill(d,{'email':f['emails'][index],'password':f['password']});button('Iniciar sesión →');w.until(lambda x:x.find_element(By.CSS_SELECTOR,'nav'));d.find_element(By.XPATH,'//nav/button[contains(.,"Vacaciones")]').click();employee()
def request(start,end):
 def submit(_):
  try:
   x=form('Solicitar vacaciones');fill(x,{'start':start.isoformat(),'end':end.isoformat()});button('Presentar solicitud',x);return True
  except StaleElementReferenceException:return False
 w.until(submit)
def pending_count():return len(d.find_elements(By.XPATH,'//div[contains(@class,"record")][.//span[normalize-space(.)="PENDIENTE"]]'))
try:
 login(0)
 if f['noPolicy']:
  w.until(lambda x:'Requiere configurar y aprobar' in x.find_element(By.TAG_NAME,'body').text);assert not d.find_elements(By.XPATH,'//form[h3[normalize-space(.)="Solicitar vacaciones"]]');d.save_screenshot('.runtime/vacations-ui-no-policy.png');print('PASS vacation request form blocked without policy')
 x=form('Aprobar una nueva versión');fill(x,{'counting':'CALENDAR','carryover':'true','reservePending':'false','leapDay':'PENDING','cancelPending':'true','cancelApproved':'true','approval':'true'});button('Registrar aprobación de política',x);form('Solicitar vacaciones');request(today+timedelta(days=1),today+timedelta(days=2));w.until(lambda x:pending_count()==1);request(today+timedelta(days=5),today+timedelta(days=7));w.until(lambda x:pending_count()==2);button('Cerrar sesión ↗');login(1)
 row=w.until(lambda x:x.find_element(By.XPATH,'//div[contains(@class,"record")][contains(.,"'+(today+timedelta(days=1)).isoformat()+'")]'));button('Revisar decisión',row);modal=w.until(lambda x:x.find_element(By.CSS_SELECTOR,'dialog[open]'));w.until(lambda x:'Disponible al revisar' in modal.text);assert 'CALENDAR' in modal.text;fill(modal,{'decision':'approve','reason':'Aprobación sintética de recorrido navegador'});button('Confirmar decisión',modal);w.until(lambda x:not x.find_elements(By.CSS_SELECTOR,'dialog[open]'));w.until(lambda x:pending_count()==1)
 button('Revisar decisión');modal=w.until(lambda x:x.find_element(By.CSS_SELECTOR,'dialog[open]'));fill(modal,{'decision':'reject','reason':'Rechazo sintético de recorrido navegador'});button('Confirmar decisión',modal);w.until(lambda x:not x.find_elements(By.CSS_SELECTOR,'dialog[open]'));w.until(lambda x:'RECHAZADA' in x.find_element(By.TAG_NAME,'body').text and 'APROBADA' in x.find_element(By.TAG_NAME,'body').text);assert pending_count()==0
 row=d.find_element(By.XPATH,'//div[contains(@class,"record")][.//span[normalize-space(.)="APROBADA"]]');button('Historial',row);modal=w.until(lambda x:x.find_element(By.CSS_SELECTOR,'dialog[open]'));w.until(lambda x:'CONSUMO' in modal.text and '2 días' in modal.text);d.save_screenshot('.runtime/vacations-ui-history.png');button('Cerrar',modal);w.until(lambda x:not x.find_elements(By.CSS_SELECTOR,'dialog[open]'));d.save_screenshot('.runtime/vacations-ui-decisions.png');print('PASS vacation policy, two requests, independent approver with balance review, approval/rejection and ledger history in browser')
finally:d.quit()
