"""Exercise integrated UI with isolated .invalid accounts; never send mail."""
import json
import os
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

fixture=json.loads(Path('.runtime/administration-ui-fixture.json').read_text(encoding='utf-8'))
options=webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--disable-gpu')
options.add_argument('--window-size=1360,1000')
driver=webdriver.Chrome(service=Service(str(Path.home()/'.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe')),options=options)
wait=WebDriverWait(driver,25)
base=os.environ.get('ARCA_UI_URL','http://localhost:5173')

def button(text,container=None):
    element=wait.until(lambda d: next((e for e in (container or d).find_elements(By.TAG_NAME,'button') if e.text.strip()==text and e.is_displayed()),False))
    driver.execute_script('arguments[0].scrollIntoView({block:"center"})',element)
    element.click()

def input_value(name,value,container=None):
    e=wait.until(lambda d:(container or d).find_element(By.NAME,name))
    e.clear();e.send_keys(value)

def dialog():
    return wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))

def row(email):
    return wait.until(lambda d: next((e for e in d.find_elements(By.CSS_SELECTOR,'article.record') if email in e.text),False))

def checkbox(value,container=None):
    element=(container or driver).find_element(By.CSS_SELECTOR,f'input[type="checkbox"][value="{value}"]')
    driver.execute_script('arguments[0].scrollIntoView({block:"center"})',element)
    element.click()

def viewport(width):
    driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':False})
    assert driver.execute_script('return innerWidth')==width
    assert driver.execute_script('return document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'

try:
    driver.get(base)
    wait.until(EC.presence_of_element_located((By.NAME,'email')))
    input_value('email',fixture['email']);input_value('password',fixture['password'])
    button('Iniciar sesión →')
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'nav')))
    driver.find_element(By.XPATH,'//nav/button[contains(. ,"Administración")]').click()
    button('Crear cuenta')
    modal=dialog();input_value('email',fixture['createdEmail'],modal);input_value('password',fixture['createdPassword'],modal)
    checkbox('HR',modal);checkbox('scopeAll',modal);checkbox('approval',modal)
    button('Crear cuenta autorizada',modal)
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
    target=row(fixture['createdEmail']);button('Editar concesiones',target)
    modal=dialog();checkbox('APPROVER',modal);checkbox('vacations.approve',modal);checkbox('scopeAll',modal);checkbox(fixture['departmentId'],modal);checkbox('approval',modal)
    button('Guardar concesiones y revocar sesiones',modal)
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR,'dialog[open]')))
    target=row(fixture['createdEmail']);wait.until(lambda d:'1 áreas' in row(fixture['createdEmail']).text)
    button('Bloquear cuenta',target);button('Confirmar cambio',dialog());wait.until(lambda d:'BLOQUEADO' in row(fixture['createdEmail']).text)
    button('Habilitar cuenta',row(fixture['createdEmail']));button('Confirmar cambio',dialog());wait.until(lambda d:'ACTIVO' in row(fixture['createdEmail']).text)
    assert 'Las concesiones propias requieren otro administrador autorizado.' in row(fixture['email']).text
    driver.save_screenshot('.runtime/administration-ui-users.png')
    for width in [375,768]:
        viewport(width)
    viewport(375)
    driver.save_screenshot('.runtime/administration-ui-mobile.png')
    button('Crear cuenta');modal=dialog()
    wait.until(lambda d:modal.find_element(By.NAME,'email'))
    viewport(375)
    driver.save_screenshot('.runtime/administration-ui-mobile-dialog.png')
    modal.find_element(By.CSS_SELECTOR,'button[aria-label="Cerrar diálogo"]').click()
    viewport(1360)
    button('Catálogos')
    section=wait.until(lambda d:next((s for s in d.find_elements(By.CSS_SELECTOR,'section.card') if s.find_elements(By.TAG_NAME,'h3') and s.find_element(By.TAG_NAME,'h3').text=='Áreas'),False))
    input_value('name',fixture['catalogName'],section);button('Agregar',section)
    target=wait.until(lambda d:next((e for e in d.find_elements(By.CSS_SELECTOR,'article.record') if fixture['catalogName'] in e.text),False))
    button('Editar',target);modal=dialog();input_value('name',fixture['catalogRenamed'],modal)
    from selenium.webdriver.support.ui import Select
    Select(modal.find_element(By.NAME,'active')).select_by_value('false')
    button('Guardar catálogo',modal)
    wait.until(lambda d:any(fixture['catalogRenamed'] in e.text and 'Inactivo' in e.text for e in d.find_elements(By.CSS_SELECTOR,'article.record')))
    button('Auditoría');wait.until(lambda d:'USER_UPDATED' in d.page_source or 'USER UPDATED' in d.page_source)
    driver.save_screenshot('.runtime/administration-ui-audit.png')
    driver.find_element(By.XPATH,'//nav/button[contains(. ,"Mi cuenta")]').click()
    wait.until(EC.presence_of_element_located((By.NAME,'currentPassword')))
    assert 'Verificación pendiente' in driver.find_element(By.CSS_SELECTOR,'.content').text
    # Do not request verification: .invalid is intentionally not a mail recipient.
    input_value('currentPassword',fixture['password']);input_value('password',fixture['changedPassword']);input_value('confirmation','IntentionallyDifferent-123')
    button('Cambiar contraseña y cerrar sesiones')
    wait.until(lambda d:'Las contraseñas nuevas no coinciden' in d.page_source)
    driver.save_screenshot('.runtime/administration-ui-account.png')
    viewport(375)
    driver.save_screenshot('.runtime/administration-ui-mobile-account.png')
    viewport(1360)
    input_value('confirmation',fixture['changedPassword']);button('Cambiar contraseña y cerrar sesiones')
    wait.until(EC.presence_of_element_located((By.NAME,'email')))
    input_value('email',fixture['email']);input_value('password',fixture['changedPassword']);button('Iniciar sesión →')
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR,'nav')))
    print('PASS UI create user, explicit role/grant/scope, block/unblock, catalog rename/state, audit, password validation/change and new login')
finally:
    driver.quit()
