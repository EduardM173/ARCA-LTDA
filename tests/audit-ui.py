from pathlib import Path
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.common.exceptions import ElementClickInterceptedException

access = Path('.runtime/initial-access.txt').read_text(encoding='utf-8')
email = re.search(r'^Correo: (.+)$', access, re.M).group(1)
password = re.search(r'^Contraseña temporal: (.+)$', access, re.M).group(1)
options = Options()
for flag in ('--headless=new', '--disable-gpu', '--disable-extensions', '--renderer-process-limit=1'):
    options.add_argument(flag)
browser = webdriver.Chrome(options=options)
try:
    browser.set_window_size(1280, 900)
    browser.get('http://localhost:5173/')
    wait = WebDriverWait(browser, 15)
    wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, 'input[name=email]'))
    browser.find_element(By.CSS_SELECTOR, 'input[name=email]').send_keys(email)
    browser.find_element(By.CSS_SELECTOR, 'input[name=password]').send_keys(password)
    browser.find_element(By.CSS_SELECTOR, 'button.primary').click()
    wait.until(lambda d: 'Cerrar sesión' in d.page_source)
    browser.find_element(By.XPATH, '//nav//button[contains(.,"Administración")]').click()
    browser.find_element(By.XPATH, '//button[normalize-space()="Auditoría"]').click()
    wait.until(lambda d: 'Auditoría por dominio' in d.page_source)
    for value in ('users', 'employees', 'vacations', 'contracts'):
        Select(browser.find_element(By.XPATH, '//label[contains(.,"Dominio")]/select')).select_by_value(value)
        wait.until(lambda d: 'eventos · página' in d.page_source)
        assert 'Servicio no disponible' not in browser.page_source
        print(value, 'audit UI PASS')
    browser.find_element(By.XPATH, '//nav//button[contains(.,"Vacaciones")]').click()
    browser.find_element(By.XPATH, '//button[contains(.,"Revisar configuración")]').click()
    wait.until(lambda d: 'Días laborables del horario semanal' in d.page_source)
    assert len(browser.find_elements(By.CSS_SELECTOR, 'input[type=checkbox]:checked')) >= 5
    print('vacation schedule UI PASS')
    try:
        browser.find_element(By.XPATH, '//nav//button[contains(.,"Mi cuenta")]').click()
    except ElementClickInterceptedException:
        print('Intercepting element:', browser.execute_script('return document.elementFromPoint(102,476)?.outerHTML?.slice(0,300)'))
        raise
    wait.until(lambda d: 'Perfil de acceso' in d.page_source)
    assert 'Servicio no disponible' not in browser.page_source
    print('account UI PASS')
finally:
    browser.quit()
