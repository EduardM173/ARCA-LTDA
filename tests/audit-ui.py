from pathlib import Path
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.keys import Keys
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
    Select(browser.find_element(By.XPATH, '//label[contains(.,"Dominio")]/select')).select_by_value('users')
    actor_button = wait.until(lambda d: d.find_element(By.XPATH, '//button[normalize-space()="Filtrar por este actor"]'))
    actor_button.click()
    actor_select = Select(browser.find_element(By.XPATH, '//label[starts-with(normalize-space(.),"Responsable")]/select'))
    assert len(actor_select.first_selected_option.get_attribute('value')) == 36
    wait.until(lambda d: 'eventos · página' in d.page_source)
    actor_select.select_by_value('')
    print('actor audit filter UI PASS')
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
    browser.find_element(By.NAME, 'currentPassword').send_keys('sin-enviar')
    browser.find_element(By.XPATH, '//nav/button[contains(.,"Inicio")]').click()
    wait.until(lambda d: 'Cambios sin guardar' in d.find_element(By.CSS_SELECTOR, '[role="dialog"]').text)
    browser.find_element(By.XPATH, '//button[normalize-space()="Seguir editando"]').click()
    assert browser.find_element(By.NAME, 'currentPassword').get_attribute('value') == 'sin-enviar'
    browser.find_element(By.XPATH, '//header//button[contains(.,"Cerrar sesión")]').click()
    wait.until(lambda d: '¿Deseas cerrar la sesión?' in d.find_element(By.CSS_SELECTOR, '[role="dialog"]').text)
    browser.find_element(By.XPATH, '//button[normalize-space()="Seguir editando"]').click()
    assert browser.find_element(By.NAME, 'currentPassword').get_attribute('value') == 'sin-enviar'
    browser.find_element(By.XPATH, '//nav/button[contains(.,"Inicio")]').click()
    browser.find_element(By.XPATH, '//button[normalize-space()="Descartar y continuar"]').click()
    wait.until(lambda d: 'Resumen de trabajo' in d.page_source)
    print('unsaved account form navigation UI PASS')
    browser.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {'width':375,'height':900,'deviceScaleFactor':1,'mobile':False})
    wait.until(lambda d: d.execute_script('return innerWidth') == 375)
    menu = browser.find_element(By.CSS_SELECTOR, '.mobile-menu-toggle')
    navigation = browser.find_element(By.ID, 'module-nav')
    assert menu.is_displayed() and not navigation.is_displayed()
    menu.click()
    wait.until(lambda d: navigation.is_displayed() and menu.get_attribute('aria-expanded') == 'true')
    browser.save_screenshot('.runtime/mobile-drawer.png')
    menu.send_keys(Keys.ESCAPE)
    wait.until(lambda d: not navigation.is_displayed())
    menu.click()
    browser.find_element(By.XPATH, '//nav/button[contains(.,"Inicio")]').click()
    wait.until(lambda d: not navigation.is_displayed() and 'Resumen de trabajo' in d.page_source)
    assert browser.execute_script('return document.documentElement.scrollWidth<=innerWidth')
    print('mobile drawer navigation UI PASS')
    browser.execute_cdp_cmd('Emulation.clearDeviceMetricsOverride', {})
    browser.set_window_size(1280, 900)
    browser.find_element(By.XPATH, '//nav/button[contains(.,"Administración")]').click()
    browser.find_element(By.XPATH, '//button[normalize-space()="Crear cuenta"]').click()
    modal = wait.until(lambda d: d.find_element(By.CSS_SELECTOR, 'dialog[open]'))
    modal.find_element(By.NAME, 'email').send_keys('sin-guardar@example.invalid')
    modal.find_element(By.CSS_SELECTOR, 'button[aria-label="Cerrar diálogo"]').click()
    wait.until(lambda d: 'Hay cambios sin guardar en este diálogo.' in modal.text)
    modal.find_element(By.XPATH, './/button[normalize-space()="Seguir editando"]').click()
    assert modal.find_element(By.NAME, 'email').get_attribute('value') == 'sin-guardar@example.invalid'
    modal.find_element(By.CSS_SELECTOR, 'button[aria-label="Cerrar diálogo"]').click()
    modal.find_element(By.XPATH, './/button[normalize-space()="Descartar cambios"]').click()
    wait.until(lambda d: not d.find_elements(By.CSS_SELECTOR, 'dialog[open]'))
    print('administration dialog unsaved changes UI PASS')
finally:
    browser.quit()
