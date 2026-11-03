import json,sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait,Select
from selenium.webdriver.support import expected_conditions as EC
f=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'));o=webdriver.ChromeOptions();o.add_argument('--headless=new');o.add_argument('--disable-gpu');o.add_argument('--window-size=1360,1000');driver=webdriver.Chrome(service=Service(str(Path.home()/'.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe')),options=o);wait=WebDriverWait(driver,30)
def button(text,root=None):
 e=wait.until(lambda d:(root or driver).find_element(By.XPATH,'.//button[normalize-space(.)="'+text+'"]'));driver.execute_script('arguments[0].scrollIntoView({block:"center"})',e);e.click()
def fill(root,name,value):
 e=wait.until(lambda d:root.find_element(By.NAME,name))
 if e.tag_name=='select':Select(e).select_by_value(value)
 else:e.clear();e.send_keys(value)
def modal():return wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
def closed():
 try:wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
 except Exception:
  driver.save_screenshot('.runtime/documents-ui-failure.png')
  print('Dialog errors:', [e.text for e in driver.find_elements(By.CSS_SELECTOR, 'dialog[open] [role=alert],dialog[open] .error')])
  raise
def navigate(name):driver.find_element(By.XPATH,'//nav/button[contains(.,"'+name+'")]').click()
def employee():
 def ready(d):
  try:
   select=d.find_element(By.XPATH,'//label[normalize-space(text())="Funcionario"]/select')
   if not any(x.get_attribute('value')==f['employeeId'] for x in select.find_elements(By.TAG_NAME,'option')):return False
   Select(select).select_by_value(f['employeeId'])
   return select.get_attribute('value')==f['employeeId']
  except Exception:return False
 wait.until(ready)
def pdf(link):
 result=driver.execute_async_script('const done=arguments[arguments.length-1];fetch(arguments[0]).then(async r=>{const b=new Uint8Array(await r.arrayBuffer());done({status:r.status,start:String.fromCharCode(...b.slice(0,5)),length:b.length})})',link)
 assert result['status']==200 and result['start']=='%PDF-' and result['length']>500
try:
 driver.get(f['base']);wait.until(EC.presence_of_element_located((By.NAME,'email')));fill(driver,'email',f['email']);fill(driver,'password',f['password']);button('Iniciar sesión →');wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'nav')))
 navigate('Contratos');button('Nueva plantilla');m=modal();fill(m,'name',f['templateName']);fill(m,'body','Contrato de {{name}}, ingreso {{hiredAt}}, salario {{salary}} {{currency}}, prueba {{probationDays}} días.');m.find_element(By.CSS_SELECTOR,'button[aria-label="Cerrar diálogo"]').click();wait.until(lambda d:'Hay cambios sin guardar en este diálogo.' in m.text);button('Seguir editando',m);assert m.find_element(By.NAME,'name').get_attribute('value')==f['templateName'];button('Guardar nueva versión',m);closed();employee();form=wait.until(EC.presence_of_element_located((By.XPATH,'//form[h3[normalize-space(.)="Nuevo borrador"]]')));select=form.find_element(By.NAME,'templateId');wait.until(lambda d:any(f['templateName'] in x.text for x in select.find_elements(By.TAG_NAME,'option')));Select(select).select_by_visible_text(next(x.text for x in select.find_elements(By.TAG_NAME,'option') if f['templateName'] in x.text));fill(form,'probationDays','90');button('Guardar borrador',form);m=modal();fill(m,'probationDays','60');button('Guardar cambios',m);closed();button('Vista previa');m=modal();assert '60' in m.find_element(By.TAG_NAME,'pre').text;m.find_element(By.CSS_SELECTOR,'button[aria-label="Cerrar diálogo"]').click();button('Revisar y emitir PDF');m=modal();assert '60' in m.find_element(By.TAG_NAME,'pre').text;assert f['templateName'] in m.text;button('Confirmar emisión',m);closed();link=wait.until(EC.presence_of_element_located((By.XPATH,'//a[contains(.,"Descargar PDF")]')));pdf(link.get_attribute('href'));driver.save_screenshot('.runtime/documents-ui-contract.png');print('PASS browser template, draft edit, pre-issue review, issuance and authorized persistent PDF')
 navigate('Boletas');button('Conceptos y políticas');form=wait.until(EC.presence_of_element_located((By.XPATH,'//form[h3[normalize-space(.)="Catálogo de conceptos"]]')));fill(form,'name',f['conceptName']);fill(form,'type','ABONO');button('Crear concepto',form);employee();button('+ Preparar boleta');button('+ Agregar partida');button('Cerrar borrador');m=modal();assert 'cambios no guardados' in m.text.lower();button('Cancelar',m);closed();button('Cerrar borrador');m=modal();button('Descartar cambios',m);closed();button('+ Preparar boleta');button('+ Agregar partida');button('+ Agregar partida');fields=driver.find_elements(By.XPATH,'//label[starts-with(normalize-space(.),"Concepto ")]/select');assert len(fields)==2
 for i,s in enumerate(fields):
  wait.until(lambda d:any(f['conceptName'] in x.text for x in s.find_elements(By.TAG_NAME,'option')));Select(s).select_by_visible_text(next(x.text for x in s.find_elements(By.TAG_NAME,'option') if f['conceptName'] in x.text));amount=s.find_element(By.XPATH,'../../label[contains(.,"Importe")]/input');amount.clear();amount.send_keys(['0.20','0.10'][i])
 button('Guardar borrador');wait.until(lambda d:'Borrador ' in d.find_element(By.TAG_NAME,'body').text);button('Revisar y emitir PDF');m=modal();button('Confirmar operación',m);closed();button('Registrar pago');m=modal();fill(m,'mode','SIMULADO');fill(m,'reference','UI-SIMULADO');button('Cancelar',m);wait.until(lambda d:'Hay cambios sin guardar en este diálogo.' in m.text);button('Seguir editando',m);assert m.find_element(By.NAME,'reference').get_attribute('value')=='UI-SIMULADO';fill(m,'evidence','Referencia sintética sin transferencia bancaria confirmada');button('Confirmar operación',m);closed();wait.until(lambda d:'PAGADO' in d.find_element(By.TAG_NAME,'body').text);assert 'no representa transferencia bancaria confirmada' in driver.find_element(By.TAG_NAME,'body').text;pdf(driver.find_element(By.XPATH,'//a[normalize-space(.)="Descargar PDF"]').get_attribute('href'));button('Ver trazabilidad');wait.until(lambda d:'PAGO_REGISTRADO' in d.page_source or 'PAGO REGISTRADO' in d.page_source);driver.save_screenshot('.runtime/documents-ui-payment.png');print('PASS browser multipart decimal payment, PDF, explicit simulated record and audit')
finally:driver.quit()
