"""Real browser Personnel journey. No API stubs or production account credentials."""
import json
import sys
from datetime import date, timedelta
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

fixture = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
today = date.fromisoformat(fixture['today'])
options = webdriver.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--disable-gpu')
options.add_argument('--window-size=1280,1000')
driver_path = Path.home() / '.cache/selenium/chromedriver/win64/156.0.8078.47/chromedriver.exe'
driver = webdriver.Chrome(service=Service(str(driver_path)), options=options)
wait = WebDriverWait(driver, 30)


def button(text, root=None):
    element = (root or driver).find_element(By.XPATH, './/button[normalize-space(.)="' + text + '"]')
    driver.execute_script('arguments[0].scrollIntoView({block:"center"})', element)
    element.click()


def form(title):
    return wait.until(EC.presence_of_element_located((By.XPATH, '//form[h3[normalize-space(.)="' + title + '"]]')))


def fill(root, values):
    for name, value in values.items():
        el = root.find_element(By.NAME, name)
        if el.tag_name == 'select':
            wait.until(lambda d:any(o.get_attribute('value') == value for o in el.find_elements(By.TAG_NAME, 'option')))
            Select(el).select_by_value(value)
        elif el.get_attribute('type') == 'date':
            driver.execute_script('arguments[0].value=arguments[1]', el, value)
        else:
            el.clear()
            el.send_keys(value)


def confirm():
    dialog = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, 'dialog[open]')))
    button('Confirmar operación', dialog)
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, 'dialog[open]')))


def login(index):
    driver.get(fixture['base'])
    wait.until(EC.presence_of_element_located((By.NAME, 'email')))
    fill(driver, {'email': fixture['users'][index]['email'], 'password': fixture['password']})
    button('Iniciar sesión →')
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, '.stats')))
    driver.find_element(By.XPATH, '//nav/button[normalize-space(.)="◇ Personal" or contains(.,"Personal")]').click()
    wait.until(EC.presence_of_element_located((By.XPATH, '//h2[normalize-space(.)="Personal de la organización"]')))


def create_employee(index):
    button('+ Nuevo funcionario')
    f = form('Alta de funcionario')
    fill(f, {'code': fixture['codes'][index], 'name': 'Funcionario UI sintético ' + str(index),
             'hiredAt': '2020-01-01', 'departmentId': fixture['departments'][0]['id'],
             'positionId': fixture['positions'][0]['id'], 'salary': '5000.10', 'currency': 'BOB'})
    button('Registrar funcionario', f)
    wait.until(EC.presence_of_element_located((By.XPATH, '//h2[normalize-space(.)="Funcionario UI sintético ' + str(index) + '"]')))


try:
    login(0)
    create_employee(0)
    f = form('Área y cargo')
    fill(f, {'departmentId': fixture['departments'][1]['id'], 'positionId': fixture['positions'][1]['id']})
    button('Guardar asignación vigente hoy', f)
    wait.until(lambda d: 'Asignación actualizada' in d.find_element(By.TAG_NAME, 'body').text)
    f = form('Nueva vigencia de remuneración')
    fill(f, {'amount': '6000.20', 'effectiveAt': today.isoformat()})
    button('Revisar nueva vigencia', f)
    confirm()
    wait.until(lambda d: 'Vigencia salarial registrada' in d.find_element(By.TAG_NAME, 'body').text)
    f = form('Ratificación')
    fill(f, {'date': today.isoformat(), 'meaning': 'Ratificación sintética explícita para recorrido E2E'})
    button('Revisar ratificación', f)
    confirm()
    wait.until(lambda d: 'Ratificación registrada' in d.find_element(By.TAG_NAME, 'body').text)
    driver.save_screenshot('.runtime/personnel-ui-active.png')
    f = form('Baja lógica')
    fill(f, {'date': today.isoformat(), 'reason': 'Baja sintética del recorrido de Personal'})
    button('Revisar baja', f)
    confirm()
    wait.until(lambda d: 'Baja registrada' in d.find_element(By.TAG_NAME, 'body').text)
    print('PASS navegador Personal: alta, ficha, asignación, salario, ratificación y baja persistentes')

    # A second valid employment period avoids impossible future reentry or retroactive salary.
    button('Cerrar ficha')
    create_employee(1)
    f = form('Baja lógica')
    fill(f, {'date': (today - timedelta(days=1)).isoformat(), 'reason': 'Baja sintética previa al reingreso autorizado'})
    button('Revisar baja', f)
    confirm()
    wait.until(lambda d: 'Baja registrada' in d.find_element(By.TAG_NAME, 'body').text)
    button('Políticas de Personal')
    f = form('Registrar una nueva aprobación')
    fill(f, {'allowRetroactiveSalary': 'false', 'allowReentry': 'true', 'compensationPoint': 'SINGLE'})
    button('Revisar aprobación', f)
    confirm()
    wait.until(lambda d: 'Política de Personal aprobada' in d.find_element(By.TAG_NAME, 'body').text)
    f = form('Reingreso autorizado')
    fill(f, {'date': today.isoformat(), 'departmentId': fixture['departments'][0]['id'],
             'positionId': fixture['positions'][0]['id'], 'salary': '5500.00',
             'reason': 'Reingreso sintético con nueva antigüedad explícita'})
    button('Revisar reingreso', f)
    confirm()
    wait.until(lambda d: 'Reingreso registrado' in d.find_element(By.TAG_NAME, 'body').text)
    assert len(driver.find_elements(By.XPATH, '//h3[normalize-space(.)="Periodos laborales"]')) == 1
    driver.save_screenshot('.runtime/personnel-ui-reentry.png')
    print('PASS navegador Personal: aprobación de política y reingreso con nuevo periodo')

    button('Cerrar sesión ↗')
    login(1)
    search = driver.find_element(By.XPATH, '//input[@placeholder="Escriba el nombre o código"]')
    search.send_keys(fixture['codes'][1])
    wait.until(lambda d: len(d.find_elements(By.XPATH, '//tbody/tr')) == 1)
    button('Ver ficha')
    wait.until(EC.presence_of_element_located((By.XPATH, '//h2[normalize-space(.)="Funcionario UI sintético 1"]')))
    assert not driver.find_elements(By.XPATH, '//h3[normalize-space(.)="Historial salarial autorizado"]')
    assert not driver.find_elements(By.XPATH, '//h3[normalize-space(.)="Nueva vigencia de remuneración"]')
    for width in [1280, 768, 375]:
        driver.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': width < 768})
        assert driver.execute_script('return window.innerWidth') == width
        assert driver.execute_script('return document.documentElement.scrollWidth <= window.innerWidth'), f'Overflow at {width}'
    driver.save_screenshot('.runtime/personnel-ui-hr-mobile.png')
    print('PASS navegador Personal: operador sin salario ni acciones privilegiadas; responsive 1280/768/375')
finally:
    driver.quit()
