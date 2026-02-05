/**
 * Legal Content - Terms, Cookies, Privacy (GDPR), Forms
 * Trilingual: Portuguese (canonical), English, Spanish
 * 
 * Source: Reputation Index, Lda. legal documents (January 2026)
 */

export type LegalLanguage = 'pt' | 'en' | 'es';

export interface LegalPageContent {
  title: string;
  lastUpdated: string;
  sections: {
    heading: string;
    content: string[];
  }[];
}

// ============================================================================
// TERMS AND CONDITIONS
// ============================================================================

export const TERMS_CONTENT: Record<LegalLanguage, LegalPageContent> = {
  pt: {
    title: "Termos e Condições",
    lastUpdated: "30 de janeiro de 2026",
    sections: [
      {
        heading: "1. Introdução",
        content: [
          "Os presentes Termos e Condições definem e esclarecem a regulamentação legal aplicável ao acesso e utilização do website https://repindex.ai/ (doravante o \"Site\"), da responsabilidade da Reputation Index, Lda., titular do CIF 519 229 185 (doravante \"REPINDEX\"). Quaisquer questões legais referentes ao Site e aos serviços prestados (doravante os \"Serviços\") poderão ser consultadas nas secções Política de Privacidade e Política de Cookies, as quais constituem parte integrante dos presentes Termos e Condições.",
          "A utilização do Site por qualquer utilizador será regulada pelos seguintes Termos e Condições, implicando a respectiva aceitação. Por favor, leia estes Termos e Condições atentamente e certifique-se de que compreende o seu conteúdo antes de utilizar os Serviços. Caso o utilizador rejeite os presentes Termos e Condições, deve cessar imediatamente a utilização do Site.",
          "A REPINDEX poderá alterar ou actualizar, no todo ou em parte, os presentes Termos e Condições, bem como a Política de Privacidade e Política de Cookies. Quaisquer alterações ou actualizações dos presentes Termos e Condições, bem como da Política de Privacidade e Política de Cookies, entrarão em vigor logo que publicados na respectiva secção do Site. Os utilizadores são aconselhados a consultar regularmente os Termos e Condições, a Política de Privacidade e a Política de Cookies para verificarem as versões mais actualizadas.",
          "O acesso e a utilização do Site são disponibilizados pela REPINDEX para disponibilização dos seus serviços ou para comunicar com os utilizadores do Site para outros fins."
        ]
      },
      {
        heading: "2. Licença",
        content: [
          "Sem prejuízo do constante nas demais cláusulas dos presentes Termos e Condições, a REPINDEX autoriza qualquer utilizador a utilizar o Site apenas para os fins previstos nos presentes Termos e Condições. A licença de utilização poderá ser revogada pela REPINDEX em qualquer momento.",
          "Nos termos da lei e dos presentes Termos e Condições, o utilizador não poderá copiar, utilizar, transferir, alugar, sublicenciar, alterar, adaptar, tentar modificar ou alterar o código-fonte, efectuar operações de engenharia reversa, descompilar ou desmontar, no todo ou em parte, o conteúdo do Site. Ao aceder ao Site, o utilizador reconhece e aceita que o respectivo conteúdo poderá estar incompleto, impreciso, desactualizado, ou que poderá não satisfazer as suas necessidades e requisitos.",
          "A violação dos presentes Termos e Condições poderá implicar a retirada da licença de utilização concedida pela REPINDEX e, bem assim, o exercício dos seus direitos, na máxima extensão possível permitida por lei, em caso de ocorrência de quaisquer danos ou pedidos de compensação peticionados por terceiros."
        ]
      },
      {
        heading: "3. Conteúdos do Site",
        content: [
          "O Site e toda a informação e conteúdos nele publicados podem ser alterados pela REPINDEX a qualquer momento, periodicamente e/ou sem aviso prévio.",
          "O acesso e utilização do Site, incluindo a visualização de páginas web, constituem actividades executadas pelos utilizadores.",
          "Os conteúdos do website podem conter incorrecções ou gralhas. A REPINDEX não é responsável, nem poderá ser responsabilizada, por qualquer meio ou modo, pelas incorrecções e erros, danos (se existentes) causados ou resultantes da utilização de informação derivada do Site ou através dele pelos utilizadores.",
          "Considerando que quaisquer conteúdos que venham a ser descarregados ou por outro meio obtidos resultam de decisão livre do utilizador e são efectuados por sua conta e risco, qualquer dano (caso exista) aos computadores ou perda de dados resultantes de operações de descarregamento efectuada pelo utilizador será da exclusiva responsabilidade do utilizador e não poderá ser imputada à REPINDEX.",
          "A REPINDEX não assume qualquer responsabilidade por eventuais danos resultantes da impossibilidade de acesso aos serviços disponibilizados através do Site ou por eventuais danos causados por vírus, ficheiros danificados, erros, omissões, interrupções do serviço, cancelamento de conteúdos, questões relacionadas com a Internet, prestadores de serviços ou com a ligação telefónica e/ou telemática, acessos não autorizados, alterações de dados, ou relacionados com a inexistência e/ou deficiente funcionamento de dispositivos electrónicos do utilizador.",
          "O utilizador é inteira e exclusivamente responsável por quaisquer acções efetuadas através da sua conta de utilizador, directamente ou mediante terceiros autorizados pelo utilizador. A REPINDEX adoptou as medidas técnicas e organizacionais adequadas a salvaguardar a segurança dos Serviços por si prestados, a assegurar a integridade dos dados de tráfego electrónico, bem como para evitar riscos de disseminação, destruição ou perda de dados e informação confidencial ou não confidencial dos seus utilizadores, constantes do Site, ou relacionados com o acesso – não autorizado ou em incumprimento das disposições legais aplicáveis – aos referidos dados pessoais e informação.",
          "A REPINDEX não garante, nem poderá garantir que o website esteja livre de vírus ou de qualquer outro elemento que possa afectar negativamente a tecnologia."
        ]
      },
      {
        heading: "4. Acesso ao Site",
        content: [
          "A REPINDEX disponibiliza o acesso ao Site, sem prejuízo da possibilidade de o mesmo poder ser suspenso, limitado ou interrompido a qualquer momento, nomeadamente para permitir a recuperação, manutenção ou introdução de novas funcionalidades ou serviços.",
          "O utilizador é responsável pela guarda e correcta utilização da sua informação pessoal e das suas credenciais de acesso. Nessas circunstâncias, o utilizador será responsável por criar o seu nome de utilizador e password. O utilizador será ainda responsável pela prestação de informação específica, correcta e actualizada. O utilizador não poderá escolher um nome de utilizador pertencente a terceiro com o intuito de utilizar a sua identidade. O utilizador não poderá, do mesmo modo, utilizar o nome de utilizador de um terceiro sem o seu consentimento expresso.",
          "O utilizador deverá garantir a confidencialidade da sua password e não deverá partilhar a mesma com terceiros."
        ]
      },
      {
        heading: "5. Protecção de Dados Pessoais",
        content: [
          "Os utilizadores são aconselhados a ler e a analisar a Política de Privacidade, que constitui parte integrante dos presentes Termos e Condições, para compreender como o Site recolhe e utiliza os dados pessoais dos utilizadores e quais as respectivas finalidades."
        ]
      },
      {
        heading: "6. Direitos de Propriedade Intelectual",
        content: [
          "Todos os direitos são reservados. O website e todos os seus conteúdos, bem como marcas, logótipos, nomes de domínio e quaisquer outros elementos que possam ser abrangidos por direitos de propriedade (incluindo os códigos-fonte) e/ou outras modalidades de direitos de propriedade intelectual (doravante \"Material\") são propriedade da REPINDEX ou de terceiros e estão protegidos contra a utilização, a cópia ou a divulgação não autorizada pelas leis nacionais e tratados internacionais relativos ao Direito de Propriedade Intelectual. Nenhuma das disposições dos Termos e Condições e/ou dos conteúdos constantes do website poderão ser interpretados como implicitamente conferindo, aceitando ou por qualquer meio licenciando o direito de utilização de qualquer Material por qualquer meio, sem o prévio consentimento escrito da REPINDEX ou do terceiro proprietário. A utilização, cópia, reprodução, alteração, republicação, actualização, descarregamento, envio por e-mail, transmissão, distribuição ou duplicação, ou qualquer outro acto abusivo do Material não especificamente identificado, mas de idêntica natureza, são proibidos.",
          "O utilizador poderá, contudo, visualizar e exibir o conteúdo do Site e/ou o Material no ecrã de um computador, armazenar tal conteúdo em formato electrónico no disco (mas não num servidor nem num dispositivo de memória conectado à Internet) ou imprimir uma cópia de tais conteúdos para sua utilização pessoal e não comercial, devendo, contudo, salvaguardar todas as informações relacionadas com os direitos de propriedade intelectual.",
          "O acesso ao website não confere ao utilizador qualquer direito sobre os conteúdos disponibilizados pela REPINDEX."
        ]
      },
      {
        heading: "7. Links para outros Websites",
        content: [
          "A eventual disponibilização pela REPINDEX no Site de ligações (\"links\") para websites de terceiros ou para conteúdos disponibilizados por terceiros (\"Outros Websites\") é incluída apenas para fins exclusivamente informativos e para conveniência do utilizador. A REPINDEX não controla os Outros Websites e, por isso, não se responsabiliza por tais Outros Websites ou pelos respectivos conteúdos ou produtos (incluindo, sem limitar, a referência a redes sociais) e não se responsabiliza por quaisquer danos ou prejuízos que possam resultar da utilização dos Outros Websites pelo utilizador, bem como quanto ao tratamento de dados pessoais durante as operações de navegação na Internet. O acesso a qualquer Outro Website, mediante uma ligação existente no Site, será efectuado por exclusiva responsabilidade e risco do utilizador.",
          "O utilizador deverá, assim, prestar particular atenção quando se conecte a Outros Websites através de ligações existentes no Site e ler com atenção os respectivos termos e condições e políticas de privacidade."
        ]
      },
      {
        heading: "8. Garantias do Utilizador",
        content: [
          "O utilizador reconhece e declara que:",
          "• Leu e compreendeu os presentes Termos e Condições;",
          "• Se absterá de reproduzir, duplicar, copiar, vender, revender ou por qualquer meio explorar comercialmente o Site ou os seus conteúdos, ou parte dos mesmos, bem como de utilizar ou reproduzir as marcas ou quaisquer direitos de propriedade intelectual ou industrial da REPINDEX ou de terceiros;",
          "• Não publicará ou utilizará, por qualquer meio, informação falsa, injuriosa ou difamatória;",
          "• Se absterá de utilizar, directa ou indirectamente, os serviços ou o Site para fins contrários à lei ou desconformes com as disposições constantes dos presentes Termos e Condições;",
          "• Não propagará vírus, spyware, adware, rootkit, backdoor ou vírus Trojan ou outras ameaças informáticas similares;",
          "• Não utilizará software ou outros mecanismos automáticos ou manuais para copiar ou aceder ao controlo do Site ou do seu conteúdo."
        ]
      },
      {
        heading: "9. Disposições Finais",
        content: [
          "Os presentes Termos e Condições reger-se-ão e serão interpretados de acordo com o Direito Português. Qualquer litígio emergente destes Termos e Condições ou com eles relacionado, na falta de acordo, será resolvido pelos Tribunais Judiciais de Lisboa, com expressa renúncia a quaisquer outros.",
          "O utilizador poderá contactar o Serviço de Cliente para qualquer questão relacionada com os Termos e Condições ou com a utilização do Site através de e-mail para info@repindex.ai."
        ]
      }
    ]
  },
  en: {
    title: "Terms and Conditions",
    lastUpdated: "January 30, 2026",
    sections: [
      {
        heading: "1. Introduction",
        content: [
          "These Terms and Conditions define and clarify the legal regulations applicable to accessing and using the website https://repindex.ai/ (hereinafter the \"Site\"), under the responsibility of Reputation Index, Lda., holder of CIF 519 229 185 (hereinafter \"REPINDEX\"). Any legal questions regarding the Site and the services provided (hereinafter the \"Services\") may be consulted in the Privacy Policy and Cookie Policy sections, which form an integral part of these Terms and Conditions.",
          "The use of the Site by any user will be governed by the following Terms and Conditions, implying their acceptance. Please read these Terms and Conditions carefully and make sure you understand their content before using the Services. If the user rejects these Terms and Conditions, they must immediately cease using the Site.",
          "REPINDEX may modify or update, in whole or in part, these Terms and Conditions, as well as the Privacy Policy and Cookie Policy. Any modifications or updates to these Terms and Conditions, as well as the Privacy Policy and Cookie Policy, will take effect as soon as they are published in the respective section of the Site. Users are advised to regularly consult the Terms and Conditions, Privacy Policy and Cookie Policy to verify the most updated versions.",
          "Access to and use of the Site are provided by REPINDEX to make its services available or to communicate with Site users for other purposes."
        ]
      },
      {
        heading: "2. License",
        content: [
          "Without prejudice to the provisions of the other clauses of these Terms and Conditions, REPINDEX authorizes any user to use the Site only for the purposes set forth in these Terms and Conditions. The license of use may be revoked by REPINDEX at any time.",
          "Under the law and these Terms and Conditions, the user may not copy, use, transfer, rent, sublicense, alter, adapt, attempt to modify or alter the source code, perform reverse engineering operations, decompile or disassemble, in whole or in part, the content of the Site. By accessing the Site, the user acknowledges and accepts that the respective content may be incomplete, inaccurate, outdated, or may not meet their needs and requirements.",
          "Violation of these Terms and Conditions may result in the withdrawal of the license of use granted by REPINDEX and, as well, the exercise of its rights, to the maximum extent permitted by law, in the event of any damages or compensation claims made by third parties."
        ]
      },
      {
        heading: "3. Site Content",
        content: [
          "The Site and all information and content published therein may be changed by REPINDEX at any time, periodically and/or without prior notice.",
          "Access to and use of the Site, including viewing web pages, constitute activities performed by users.",
          "The website content may contain inaccuracies or typographical errors. REPINDEX is not responsible, nor may it be held responsible, by any means or manner, for inaccuracies and errors, damages (if any) caused or resulting from the use of information derived from the Site or through it by users.",
          "Considering that any content that may be downloaded or otherwise obtained results from the user's free decision and is carried out at their own risk, any damage (if any) to computers or loss of data resulting from download operations carried out by the user will be the sole responsibility of the user and may not be attributed to REPINDEX.",
          "REPINDEX assumes no responsibility for any damages resulting from the inability to access the services provided through the Site or for any damages caused by viruses, corrupted files, errors, omissions, service interruptions, content cancellations, issues related to the Internet, service providers or telephone and/or telematic connection, unauthorized access, data changes, or related to the non-existence and/or deficient operation of the user's electronic devices.",
          "The user is entirely and exclusively responsible for any actions performed through their user account, directly or through third parties authorized by the user. REPINDEX has adopted appropriate technical and organizational measures to safeguard the security of the Services it provides, to ensure the integrity of electronic traffic data, as well as to prevent risks of dissemination, destruction or loss of data and confidential or non-confidential information of its users, contained on the Site, or related to access – unauthorized or in breach of applicable legal provisions – to said personal data and information.",
          "REPINDEX does not guarantee, nor can it guarantee, that the website is free of viruses or any other element that may negatively affect technology."
        ]
      },
      {
        heading: "4. Access to the Site",
        content: [
          "REPINDEX provides access to the Site, without prejudice to the possibility of it being suspended, limited or interrupted at any time, namely to allow the recovery, maintenance or introduction of new features or services.",
          "The user is responsible for the safekeeping and correct use of their personal information and their access credentials. In these circumstances, the user will be responsible for creating their username and password. The user will also be responsible for providing specific, correct and updated information. The user may not choose a username belonging to a third party with the intention of using their identity. The user may not, likewise, use the username of a third party without their express consent.",
          "The user must ensure the confidentiality of their password and must not share it with third parties."
        ]
      },
      {
        heading: "5. Personal Data Protection",
        content: [
          "Users are advised to read and analyze the Privacy Policy, which forms an integral part of these Terms and Conditions, to understand how the Site collects and uses users' personal data and for what purposes."
        ]
      },
      {
        heading: "6. Intellectual Property Rights",
        content: [
          "All rights are reserved. The website and all its content, as well as trademarks, logos, domain names and any other elements that may be covered by property rights (including source codes) and/or other forms of intellectual property rights (hereinafter \"Material\") are the property of REPINDEX or third parties and are protected against unauthorized use, copying or disclosure by national laws and international treaties relating to Intellectual Property Law. None of the provisions of the Terms and Conditions and/or the content on the website may be interpreted as implicitly granting, accepting or in any way licensing the right to use any Material by any means, without the prior written consent of REPINDEX or the third-party owner. The use, copying, reproduction, modification, republication, update, download, email sending, transmission, distribution or duplication, or any other abusive act of the Material not specifically identified, but of identical nature, are prohibited.",
          "The user may, however, view and display the content of the Site and/or the Material on a computer screen, store such content in electronic format on disk (but not on a server or memory device connected to the Internet) or print a copy of such content for their personal and non-commercial use, while safeguarding all information related to intellectual property rights.",
          "Access to the website does not confer on the user any right to the content made available by REPINDEX."
        ]
      },
      {
        heading: "7. Links to Other Websites",
        content: [
          "Any provision by REPINDEX on the Site of links to third-party websites or content provided by third parties (\"Other Websites\") is included solely for informational purposes and for the user's convenience. REPINDEX does not control Other Websites and, therefore, is not responsible for such Other Websites or their content or products (including, without limitation, references to social networks) and is not responsible for any damages or losses that may result from the user's use of Other Websites, as well as regarding the processing of personal data during Internet browsing operations. Access to any Other Website through a link on the Site will be made at the user's sole responsibility and risk.",
          "The user should, therefore, pay particular attention when connecting to Other Websites through links on the Site and carefully read their respective terms and conditions and privacy policies."
        ]
      },
      {
        heading: "8. User Warranties",
        content: [
          "The user acknowledges and declares that:",
          "• They have read and understood these Terms and Conditions;",
          "• They will refrain from reproducing, duplicating, copying, selling, reselling or in any way commercially exploiting the Site or its content, or part thereof, as well as from using or reproducing the trademarks or any intellectual or industrial property rights of REPINDEX or third parties;",
          "• They will not publish or use, by any means, false, defamatory or libelous information;",
          "• They will refrain from using, directly or indirectly, the services or the Site for purposes contrary to the law or inconsistent with the provisions of these Terms and Conditions;",
          "• They will not spread viruses, spyware, adware, rootkits, backdoors or Trojan viruses or other similar computer threats;",
          "• They will not use software or other automatic or manual mechanisms to copy or gain access to control the Site or its content."
        ]
      },
      {
        heading: "9. Final Provisions",
        content: [
          "These Terms and Conditions shall be governed by and construed in accordance with Portuguese Law. Any dispute arising from or related to these Terms and Conditions, in the absence of agreement, shall be resolved by the Courts of Lisbon, with express waiver of any others.",
          "The user may contact Customer Service for any questions related to the Terms and Conditions or the use of the Site by email to info@repindex.ai."
        ]
      }
    ]
  },
  es: {
    title: "Términos y Condiciones",
    lastUpdated: "30 de enero de 2026",
    sections: [
      {
        heading: "1. Introducción",
        content: [
          "Los presentes Términos y Condiciones definen y aclaran la regulación legal aplicable al acceso y utilización del sitio web https://repindex.ai/ (en adelante el \"Sitio\"), bajo la responsabilidad de Reputation Index, Lda., titular del CIF 519 229 185 (en adelante \"REPINDEX\"). Cualquier cuestión legal referente al Sitio y a los servicios prestados (en adelante los \"Servicios\") podrá consultarse en las secciones Política de Privacidad y Política de Cookies, las cuales forman parte integrante de los presentes Términos y Condiciones.",
          "La utilización del Sitio por cualquier usuario estará regulada por los siguientes Términos y Condiciones, implicando su respectiva aceptación. Por favor, lea estos Términos y Condiciones atentamente y asegúrese de que comprende su contenido antes de utilizar los Servicios. Si el usuario rechaza los presentes Términos y Condiciones, debe cesar inmediatamente la utilización del Sitio.",
          "REPINDEX podrá modificar o actualizar, en todo o en parte, los presentes Términos y Condiciones, así como la Política de Privacidad y Política de Cookies. Cualquier modificación o actualización de los presentes Términos y Condiciones, así como de la Política de Privacidad y Política de Cookies, entrará en vigor en cuanto se publique en la respectiva sección del Sitio. Se aconseja a los usuarios consultar regularmente los Términos y Condiciones, la Política de Privacidad y la Política de Cookies para verificar las versiones más actualizadas.",
          "El acceso y la utilización del Sitio son proporcionados por REPINDEX para la disponibilización de sus servicios o para comunicarse con los usuarios del Sitio para otros fines."
        ]
      },
      {
        heading: "2. Licencia",
        content: [
          "Sin perjuicio de lo establecido en las demás cláusulas de los presentes Términos y Condiciones, REPINDEX autoriza a cualquier usuario a utilizar el Sitio únicamente para los fines previstos en los presentes Términos y Condiciones. La licencia de uso podrá ser revocada por REPINDEX en cualquier momento.",
          "En los términos de la ley y de los presentes Términos y Condiciones, el usuario no podrá copiar, utilizar, transferir, alquilar, sublicenciar, alterar, adaptar, intentar modificar o alterar el código fuente, realizar operaciones de ingeniería inversa, descompilar o desmontar, en todo o en parte, el contenido del Sitio. Al acceder al Sitio, el usuario reconoce y acepta que el respectivo contenido podrá estar incompleto, impreciso, desactualizado, o que podrá no satisfacer sus necesidades y requisitos.",
          "La violación de los presentes Términos y Condiciones podrá implicar la retirada de la licencia de uso concedida por REPINDEX y, asimismo, el ejercicio de sus derechos, en la máxima extensión posible permitida por la ley, en caso de que se produzcan daños o reclamaciones de compensación formuladas por terceros."
        ]
      },
      {
        heading: "3. Contenidos del Sitio",
        content: [
          "El Sitio y toda la información y contenidos publicados en él pueden ser modificados por REPINDEX en cualquier momento, periódicamente y/o sin previo aviso.",
          "El acceso y utilización del Sitio, incluyendo la visualización de páginas web, constituyen actividades ejecutadas por los usuarios.",
          "Los contenidos del sitio web pueden contener inexactitudes o erratas. REPINDEX no es responsable, ni podrá ser considerada responsable, por ningún medio o modo, por las inexactitudes y errores, daños (si los hubiera) causados o resultantes de la utilización de información derivada del Sitio o a través de él por los usuarios.",
          "Considerando que cualquier contenido que sea descargado o de otro modo obtenido resulta de la decisión libre del usuario y se realiza por su cuenta y riesgo, cualquier daño (si lo hubiera) a los ordenadores o pérdida de datos resultantes de operaciones de descarga realizadas por el usuario será de exclusiva responsabilidad del usuario y no podrá ser imputado a REPINDEX.",
          "REPINDEX no asume ninguna responsabilidad por eventuales daños resultantes de la imposibilidad de acceso a los servicios disponibilizados a través del Sitio o por eventuales daños causados por virus, archivos dañados, errores, omisiones, interrupciones del servicio, cancelación de contenidos, cuestiones relacionadas con Internet, proveedores de servicios o con la conexión telefónica y/o telemática, accesos no autorizados, alteraciones de datos, o relacionados con la inexistencia y/o funcionamiento deficiente de dispositivos electrónicos del usuario.",
          "El usuario es entera y exclusivamente responsable de cualesquiera acciones efectuadas a través de su cuenta de usuario, directamente o mediante terceros autorizados por el usuario. REPINDEX ha adoptado las medidas técnicas y organizativas adecuadas para salvaguardar la seguridad de los Servicios prestados por ella, para asegurar la integridad de los datos de tráfico electrónico, así como para evitar riesgos de diseminación, destrucción o pérdida de datos e información confidencial o no confidencial de sus usuarios, contenida en el Sitio, o relacionada con el acceso – no autorizado o en incumplimiento de las disposiciones legales aplicables – a dichos datos personales e información.",
          "REPINDEX no garantiza, ni puede garantizar, que el sitio web esté libre de virus o de cualquier otro elemento que pueda afectar negativamente a la tecnología."
        ]
      },
      {
        heading: "4. Acceso al Sitio",
        content: [
          "REPINDEX proporciona el acceso al Sitio, sin perjuicio de la posibilidad de que el mismo pueda ser suspendido, limitado o interrumpido en cualquier momento, especialmente para permitir la recuperación, mantenimiento o introducción de nuevas funcionalidades o servicios.",
          "El usuario es responsable de la custodia y correcta utilización de su información personal y de sus credenciales de acceso. En estas circunstancias, el usuario será responsable de crear su nombre de usuario y contraseña. El usuario será también responsable de proporcionar información específica, correcta y actualizada. El usuario no podrá elegir un nombre de usuario perteneciente a un tercero con la intención de utilizar su identidad. El usuario no podrá, del mismo modo, utilizar el nombre de usuario de un tercero sin su consentimiento expreso.",
          "El usuario deberá garantizar la confidencialidad de su contraseña y no deberá compartirla con terceros."
        ]
      },
      {
        heading: "5. Protección de Datos Personales",
        content: [
          "Se aconseja a los usuarios leer y analizar la Política de Privacidad, que forma parte integrante de los presentes Términos y Condiciones, para comprender cómo el Sitio recoge y utiliza los datos personales de los usuarios y cuáles son sus respectivas finalidades."
        ]
      },
      {
        heading: "6. Derechos de Propiedad Intelectual",
        content: [
          "Todos los derechos están reservados. El sitio web y todos sus contenidos, así como marcas, logotipos, nombres de dominio y cualesquiera otros elementos que puedan estar cubiertos por derechos de propiedad (incluyendo los códigos fuente) y/u otras modalidades de derechos de propiedad intelectual (en adelante \"Material\") son propiedad de REPINDEX o de terceros y están protegidos contra la utilización, copia o divulgación no autorizada por las leyes nacionales y tratados internacionales relativos al Derecho de Propiedad Intelectual. Ninguna de las disposiciones de los Términos y Condiciones y/o de los contenidos del sitio web podrá interpretarse como si confiriera implícitamente, aceptara o de cualquier modo licenciara el derecho de utilización de cualquier Material por cualquier medio, sin el previo consentimiento escrito de REPINDEX o del tercero propietario. La utilización, copia, reproducción, modificación, republicación, actualización, descarga, envío por correo electrónico, transmisión, distribución o duplicación, o cualquier otro acto abusivo del Material no específicamente identificado, pero de idéntica naturaleza, están prohibidos.",
          "El usuario podrá, sin embargo, visualizar y exhibir el contenido del Sitio y/o el Material en la pantalla de un ordenador, almacenar dicho contenido en formato electrónico en disco (pero no en un servidor ni en un dispositivo de memoria conectado a Internet) o imprimir una copia de dichos contenidos para su uso personal y no comercial, debiendo, sin embargo, salvaguardar toda la información relacionada con los derechos de propiedad intelectual.",
          "El acceso al sitio web no confiere al usuario ningún derecho sobre los contenidos proporcionados por REPINDEX."
        ]
      },
      {
        heading: "7. Enlaces a otros Sitios Web",
        content: [
          "La eventual disponibilización por REPINDEX en el Sitio de enlaces (\"links\") a sitios web de terceros o a contenidos proporcionados por terceros (\"Otros Sitios Web\") se incluye únicamente con fines exclusivamente informativos y para conveniencia del usuario. REPINDEX no controla los Otros Sitios Web y, por lo tanto, no se responsabiliza de dichos Otros Sitios Web o de sus respectivos contenidos o productos (incluyendo, sin limitación, la referencia a redes sociales) y no se responsabiliza de cualesquiera daños o perjuicios que puedan resultar de la utilización de los Otros Sitios Web por el usuario, así como en relación con el tratamiento de datos personales durante las operaciones de navegación por Internet. El acceso a cualquier Otro Sitio Web mediante un enlace existente en el Sitio se realizará bajo la exclusiva responsabilidad y riesgo del usuario.",
          "El usuario deberá, por tanto, prestar especial atención cuando se conecte a Otros Sitios Web a través de enlaces existentes en el Sitio y leer con atención los respectivos términos y condiciones y políticas de privacidad."
        ]
      },
      {
        heading: "8. Garantías del Usuario",
        content: [
          "El usuario reconoce y declara que:",
          "• Ha leído y comprendido los presentes Términos y Condiciones;",
          "• Se abstendrá de reproducir, duplicar, copiar, vender, revender o de cualquier modo explotar comercialmente el Sitio o sus contenidos, o parte de los mismos, así como de utilizar o reproducir las marcas o cualesquiera derechos de propiedad intelectual o industrial de REPINDEX o de terceros;",
          "• No publicará ni utilizará, por ningún medio, información falsa, injuriosa o difamatoria;",
          "• Se abstendrá de utilizar, directa o indirectamente, los servicios o el Sitio para fines contrarios a la ley o disconformes con las disposiciones contenidas en los presentes Términos y Condiciones;",
          "• No propagará virus, spyware, adware, rootkits, backdoors o virus Troyanos u otras amenazas informáticas similares;",
          "• No utilizará software u otros mecanismos automáticos o manuales para copiar o acceder al control del Sitio o de su contenido."
        ]
      },
      {
        heading: "9. Disposiciones Finales",
        content: [
          "Los presentes Términos y Condiciones se regirán e interpretarán de acuerdo con el Derecho Portugués. Cualquier litigio derivado de estos Términos y Condiciones o relacionado con ellos, a falta de acuerdo, será resuelto por los Tribunales Judiciales de Lisboa, con expresa renuncia a cualesquiera otros.",
          "El usuario podrá contactar con el Servicio de Atención al Cliente para cualquier cuestión relacionada con los Términos y Condiciones o con la utilización del Sitio a través de correo electrónico a info@repindex.ai."
        ]
      }
    ]
  }
};

// ============================================================================
// COOKIE POLICY
// ============================================================================

export const COOKIES_CONTENT: Record<LegalLanguage, LegalPageContent> = {
  pt: {
    title: "Política de Cookies",
    lastUpdated: "30 de janeiro de 2026",
    sections: [
      {
        heading: "",
        content: [
          "Com a presente Política de Cookies, a Reputation Index, Lda. pretende informá-lo sobre a utilização de cookies neste website."
        ]
      },
      {
        heading: "1. O que são cookies e quais as suas categorias",
        content: [
          "Um cookie é um pequeno arquivo de texto que um website – quando visitado por um utilizador – pede ao seu navegador (browser) para armazenar no seu dispositivo (computador, telemóvel/smartphone ou tablet), a fim de lembrar informações sobre si, tais como a sua preferência de idioma ou informações de login. Esses cookies são chamados cookies próprios e são definidos pelo website que está a visitar.",
          "Também podem ser usados cookies de terceiros – que são cookies de um domínio diferente do website que está a visitar – para iniciativas de publicidade e marketing – e que são definidos por um website de terceiros. A Reputation Index, Lda. não é responsável pelo conteúdo e veracidade das políticas de privacidade de componentes de terceiros.",
          "O uso de cookies neste website pode estar sujeito à aceitação dos mesmos pelo utilizador."
        ]
      },
      {
        heading: "2. Validade dos cookies",
        content: [
          "Relativamente à data de validade, os cookies podem ser:",
          "• Cookies de sessão: são temporários, estão disponíveis até encerrar a sessão. Da próxima vez que o utilizador aceder ao seu browser, os cookies já não estarão armazenados. A informação obtida permite gerir as sessões, identificar problemas e fornecer uma melhor experiência de navegação.",
          "• Cookies permanentes: ficam armazenados no dispositivo de acesso, ao nível do browser, e são usados sempre que o utilizador visita novamente o website. Em geral, são usados para direccionar a navegação de acordo com os interesses do utilizador, permitindo a prestação de um serviço mais personalizado."
        ]
      },
      {
        heading: "3. Cookies utilizados neste website",
        content: [
          "Neste website, usamos os cookies identificados no respectivo centro de preferências.",
          "• Estritamente necessários: Essenciais para o funcionamento do website.",
          "• Desempenho e análise: Permitem-nos analisar o uso do website para melhorar a experiência.",
          "• Funcionalidade: Lembram as suas preferências e escolhas.",
          "• Publicidade: Podem ser usados para apresentar anúncios relevantes (se aplicável)."
        ]
      },
      {
        heading: "4. Desactivar a utilização dos cookies",
        content: [
          "Os utilizadores podem desactivar ou remover a utilização dos cookies neste website a qualquer momento, excepto os estritamente necessários para o seu funcionamento.",
          "É importante notar que a desativação ou remoção dos cookies pode impedir que algumas funcionalidades e serviços do website funcionem correctamente, afectando, total ou parcialmente, a navegação na página. Para remover ou desactivar o uso de cookies neste website, deve:",
          "• Aceder ao centro de preferências de cookies deste website;",
          "• Selecionar as configurações apropriadas do seu browser (Internet Explorer, Google Chrome, Firefox, Safari, etc.) que podem encontrar-se no menu \"Opções\" ou \"Preferências\". As configurações podem variar se aceder a este website através de outro navegador;",
          "• Nas configurações do seu dispositivo móvel, pode optar por não usar os identificadores de publicidade e/ou de localização;",
          "• Ir às ferramentas de terceiros disponíveis online que permitem que os utilizadores detectem os cookies das páginas que visitam e façam a gestão da sua desactivação."
        ]
      },
      {
        heading: "5. Actualização da política de cookies",
        content: [
          "A REPINDEX pode modificar esta política de cookies a qualquer momento, caso tal se justifique. Aconselhamos a consulta regular desta Política para verificar as versões mais actualizadas."
        ]
      }
    ]
  },
  en: {
    title: "Cookie Policy",
    lastUpdated: "January 30, 2026",
    sections: [
      {
        heading: "",
        content: [
          "With this Cookie Policy, Reputation Index, Lda. intends to inform you about the use of cookies on this website."
        ]
      },
      {
        heading: "1. What are cookies and what are their categories",
        content: [
          "A cookie is a small text file that a website – when visited by a user – asks your browser to store on your device (computer, mobile phone/smartphone or tablet), in order to remember information about you, such as your language preference or login information. These cookies are called first-party cookies and are set by the website you are visiting.",
          "Third-party cookies may also be used – which are cookies from a domain different from the website you are visiting – for advertising and marketing initiatives – and which are set by a third-party website. Reputation Index, Lda. is not responsible for the content and accuracy of the privacy policies of third-party components.",
          "The use of cookies on this website may be subject to the user's acceptance."
        ]
      },
      {
        heading: "2. Cookie validity",
        content: [
          "Regarding the expiration date, cookies can be:",
          "• Session cookies: are temporary, available until the session ends. The next time the user accesses their browser, the cookies will no longer be stored. The information obtained allows session management, problem identification and provision of a better browsing experience.",
          "• Permanent cookies: are stored on the access device, at the browser level, and are used whenever the user visits the website again. In general, they are used to direct navigation according to the user's interests, allowing for a more personalized service."
        ]
      },
      {
        heading: "3. Cookies used on this website",
        content: [
          "On this website, we use the cookies identified in the respective preferences center.",
          "• Strictly necessary: Essential for the website to function.",
          "• Performance and analytics: Allow us to analyze website usage to improve the experience.",
          "• Functionality: Remember your preferences and choices.",
          "• Advertising: May be used to present relevant ads (if applicable)."
        ]
      },
      {
        heading: "4. Disabling cookies",
        content: [
          "Users can disable or remove the use of cookies on this website at any time, except those strictly necessary for its operation.",
          "It is important to note that disabling or removing cookies may prevent some features and services of the website from functioning properly, affecting, totally or partially, navigation on the page. To remove or disable the use of cookies on this website, you should:",
          "• Access the cookie preferences center of this website;",
          "• Select the appropriate settings of your browser (Internet Explorer, Google Chrome, Firefox, Safari, etc.) which can be found in the \"Options\" or \"Preferences\" menu. Settings may vary if you access this website through another browser;",
          "• In your mobile device settings, you can choose not to use advertising and/or location identifiers;",
          "• Go to third-party tools available online that allow users to detect the cookies of the pages they visit and manage their deactivation."
        ]
      },
      {
        heading: "5. Cookie policy updates",
        content: [
          "REPINDEX may modify this cookie policy at any time if justified. We advise regular consultation of this Policy to verify the most updated versions."
        ]
      }
    ]
  },
  es: {
    title: "Política de Cookies",
    lastUpdated: "30 de enero de 2026",
    sections: [
      {
        heading: "",
        content: [
          "Con la presente Política de Cookies, Reputation Index, Lda. pretende informarle sobre el uso de cookies en este sitio web."
        ]
      },
      {
        heading: "1. Qué son las cookies y cuáles son sus categorías",
        content: [
          "Una cookie es un pequeño archivo de texto que un sitio web – cuando es visitado por un usuario – pide a su navegador (browser) que almacene en su dispositivo (ordenador, teléfono móvil/smartphone o tablet), con el fin de recordar información sobre usted, como su preferencia de idioma o información de inicio de sesión. Estas cookies se llaman cookies propias y son definidas por el sitio web que está visitando.",
          "También pueden usarse cookies de terceros – que son cookies de un dominio diferente del sitio web que está visitando – para iniciativas de publicidad y marketing – y que son definidas por un sitio web de terceros. Reputation Index, Lda. no es responsable del contenido y veracidad de las políticas de privacidad de componentes de terceros.",
          "El uso de cookies en este sitio web puede estar sujeto a la aceptación de las mismas por el usuario."
        ]
      },
      {
        heading: "2. Validez de las cookies",
        content: [
          "En relación con la fecha de validez, las cookies pueden ser:",
          "• Cookies de sesión: son temporales, están disponibles hasta cerrar la sesión. La próxima vez que el usuario acceda a su navegador, las cookies ya no estarán almacenadas. La información obtenida permite gestionar las sesiones, identificar problemas y proporcionar una mejor experiencia de navegación.",
          "• Cookies permanentes: quedan almacenadas en el dispositivo de acceso, a nivel del navegador, y se usan siempre que el usuario visita nuevamente el sitio web. En general, se usan para dirigir la navegación de acuerdo con los intereses del usuario, permitiendo la prestación de un servicio más personalizado."
        ]
      },
      {
        heading: "3. Cookies utilizadas en este sitio web",
        content: [
          "En este sitio web, usamos las cookies identificadas en el respectivo centro de preferencias.",
          "• Estrictamente necesarias: Esenciales para el funcionamiento del sitio web.",
          "• Rendimiento y análisis: Nos permiten analizar el uso del sitio web para mejorar la experiencia.",
          "• Funcionalidad: Recuerdan sus preferencias y elecciones.",
          "• Publicidad: Pueden usarse para presentar anuncios relevantes (si aplica)."
        ]
      },
      {
        heading: "4. Desactivar el uso de cookies",
        content: [
          "Los usuarios pueden desactivar o eliminar el uso de cookies en este sitio web en cualquier momento, excepto las estrictamente necesarias para su funcionamiento.",
          "Es importante señalar que la desactivación o eliminación de cookies puede impedir que algunas funcionalidades y servicios del sitio web funcionen correctamente, afectando, total o parcialmente, la navegación en la página. Para eliminar o desactivar el uso de cookies en este sitio web, debe:",
          "• Acceder al centro de preferencias de cookies de este sitio web;",
          "• Seleccionar las configuraciones apropiadas de su navegador (Internet Explorer, Google Chrome, Firefox, Safari, etc.) que pueden encontrarse en el menú \"Opciones\" o \"Preferencias\". Las configuraciones pueden variar si accede a este sitio web a través de otro navegador;",
          "• En las configuraciones de su dispositivo móvil, puede optar por no usar los identificadores de publicidad y/o de localización;",
          "• Ir a las herramientas de terceros disponibles online que permiten a los usuarios detectar las cookies de las páginas que visitan y gestionar su desactivación."
        ]
      },
      {
        heading: "5. Actualización de la política de cookies",
        content: [
          "REPINDEX puede modificar esta política de cookies en cualquier momento si se justifica. Aconsejamos la consulta regular de esta Política para verificar las versiones más actualizadas."
        ]
      }
    ]
  }
};

// ============================================================================
// PRIVACY POLICY (GDPR)
// ============================================================================

export const PRIVACY_CONTENT: Record<LegalLanguage, LegalPageContent> = {
  pt: {
    title: "Política de Protecção de Dados e Privacidade",
    lastUpdated: "30 de janeiro de 2026",
    sections: [
      {
        heading: "",
        content: [
          "A Reputation Index, Lda. assegura o cumprimento das obrigações decorrentes do Regulamento (UE) 2016/679 do Parlamento Europeu e do Conselho (RGPD) e demais legislação sobre matéria de protecção de dados pessoais e privacidade."
        ]
      },
      {
        heading: "1. Quem é o responsável pelo tratamento dos meus dados pessoais?",
        content: [
          "A Reputation Index, Lda., com o NIF 519 229 185 (adiante designada por \"REPINDEX\"), é a responsável pelo tratamento dos seus dados pessoais para as finalidades indicadas na presente Política de Protecção de Dados Pessoais e Privacidade (doravante, \"Política\")."
        ]
      },
      {
        heading: "2. Para que finalidade vão ser tratados os meus dados pessoais?",
        content: [
          "A REPINDEX procederá ao tratamento das seguintes categorias de dados pessoais para as finalidades a seguir enunciadas:",
          "• Gestão de website e perfil do utilizador: Identificação pessoal, autenticação, acessos e contacto. Fundamento: Execução do contrato cujos termos se regem pelos T&C de uso do website. Prazo: Até 6 meses a contar da última visita ao website.",
          "• Gestão de clientes e contratos: Identificação pessoal, autenticação, acessos e contacto. Fundamento: Diligências pré-contratuais ou execução do contrato. Prazo: Até 1 ano do termo do contrato ou, não tendo sido celebrado, até 6 meses a contar da última comunicação.",
          "• Processo judicial: Fundamento: Execução do contrato. Prazo: Até 6 meses após o trânsito em julgado da respectiva sentença.",
          "• Prestação de informações: Fundamento: Obrigação legal. Prazo: Pelo período legal."
        ]
      },
      {
        heading: "3. Informações sobre consentimento",
        content: [
          "Caso o fundamento de licitude para o tratamento dos seus dados pessoais seja o consentimento, o titular dos dados pode retirar o mesmo, de forma livre e gratuita, a qualquer altura, sem que daí advenha qualquer consequência negativa. No entanto, a retirada do consentimento não compromete a licitude dos tratamentos efectuados com base nos consentimentos anteriormente dados. Caso seja retirado o consentimento, a REPINDEX cessará imediatamente o tratamento dos seus dados pessoais para a finalidade em causa e procederá ao apagamento dos mesmos, salvo se houver necessidade de tratar os dados ou de os conservar para o cumprimento de obrigações legais e/ou contratuais ou se existir outro fundamento de licitude para o tratamento destes dados, nos termos da legislação aplicável.",
          "Quando os dados sejam tratados com fundamento em interesses legítimos ou interesse público, ou quando sejam tratados para fins de comercialização direta, o titular dos dados tem o direito de se opor ao tratamento, o que poderá fazer a todo o tempo. Neste caso, a REPINDEX cessará o tratamento dos dados pessoais, excepto se existirem razões imperiosas e legítimas para a continuação desse tratamento que prevaleçam sobre os interesses, direitos e liberdades do titular, ou se os dados forem necessários para efeitos de declaração, exercício ou defesa de um direito num processo judicial.",
          "Se o fundamento de licitude para o tratamento dos dados for a sua necessidade para diligências pré-contratuais ou para execução do contrato, caso não nos faculte os dados pessoais solicitados, tal poderá impedir a conclusão do contrato e/ou, quando aplicável, inviabilizar que lhe sejam fornecidos os serviços solicitados."
        ]
      },
      {
        heading: "4. Como é que os meus dados pessoais vão ser tratados?",
        content: [
          "Os seus dados pessoais serão tratados pela REPINDEX, no contexto das finalidades indicadas, de acordo com esta Política e a legislação aplicável e com recurso a medidas técnicas e organizativas adequadas para promover a respectiva segurança e confidencialidade, nomeadamente em relação ao tratamento não autorizado ou ilícito dos seus dados pessoais e à respectiva perda, destruição ou danificação acidental. Os tratamentos dos seus dados ao abrigo da presente Política não implicarão a tomada de decisões individuais automatizadas."
        ]
      },
      {
        heading: "5. Quem são os destinatários dos meus dados pessoais?",
        content: [
          "Poderá receber informação adicional sobre as entidades em específico a quem poderão ser facultados os seus dados, podendo solicitar esta informação através dos meios de contacto referidos no ponto desta Política sobre o exercício dos seus direitos.",
          "A REPINDEX pode transferir os seus dados pessoais para fora do Espaço Económico Europeu, caso tal se justifique no âmbito da execução de um contrato ou em cumprimento de uma obrigação legal, assegurando que estas transferências cumprem a legislação aplicável, nomeadamente o Capítulo V do RGPD, na sua redacção actualmente em vigor. Tal poderá ser garantido, por exemplo, assegurando que os dados pessoais apenas são transferidos ao abrigo de uma decisão de adequação da Comissão Europeia ou das cláusulas contratuais-tipo aprovadas pela Comissão Europeia (estas últimas complementadas, se necessário, por medidas suplementares para garantir um nível de protecção adequado), ou ainda por via de regras vinculativas aplicáveis às empresas ou de qualquer outro meio legalmente previsto que seja adequado à transferência."
        ]
      },
      {
        heading: "6. Que direitos tenho sobre os meus dados pessoais?",
        content: [
          "Enquanto titular dos dados, sempre que aplicável, poderá exercer os seguintes direitos:",
          "• Direito de acesso",
          "• Direito de rectificação",
          "• Direito ao apagamento",
          "• Direito à limitação do tratamento",
          "• Direito de portabilidade dos dados",
          "• Direito de oposição"
        ]
      },
      {
        heading: "7. Informação sobre cookies",
        content: [
          "Aconselhamos a leitura da política de cookies disponibilizada neste website e que constitui parte integrante da presente Política, para saber mais informações a respeito do tratamento dos seus dados pessoais realizado através desta funcionalidade."
        ]
      },
      {
        heading: "8. Alterações",
        content: [
          "A REPINDEX pode, a qualquer momento, alterar a presente Política em conformidade com novos requisitos legais ou regulamentares ou proceder à respectiva actualização, caso tal se justifique. Aconselhamos a consulta regular desta Política para verificar as versões mais actualizadas, sendo que a REPINDEX procurará dar conhecimento de quaisquer alterações relevantes, nomeadamente através da colocação de um aviso no website e/ou dos meios de contacto que nos tenha disponibilizado, quando aplicável.",
          "Para quaisquer outras questões relacionadas com a proteção e privacidade dos dados pessoais pode contactar o Encarregado da Protecção de Dados do REPINDEX através do e-mail dpo@repindex.ai."
        ]
      }
    ]
  },
  en: {
    title: "Data Protection and Privacy Policy",
    lastUpdated: "January 30, 2026",
    sections: [
      {
        heading: "",
        content: [
          "Reputation Index, Lda. ensures compliance with the obligations arising from Regulation (EU) 2016/679 of the European Parliament and of the Council (GDPR) and other legislation on personal data protection and privacy."
        ]
      },
      {
        heading: "1. Who is responsible for processing my personal data?",
        content: [
          "Reputation Index, Lda., with NIF 519 229 185 (hereinafter referred to as \"REPINDEX\"), is responsible for the processing of your personal data for the purposes indicated in this Data Protection and Privacy Policy (hereinafter, \"Policy\")."
        ]
      },
      {
        heading: "2. For what purpose will my personal data be processed?",
        content: [
          "REPINDEX will process the following categories of personal data for the purposes set out below:",
          "• Website and user profile management: Personal identification, authentication, access and contact. Legal basis: Execution of the contract whose terms are governed by the T&C of website use. Retention period: Up to 6 months from the last visit to the website.",
          "• Customer and contract management: Personal identification, authentication, access and contact. Legal basis: Pre-contractual steps or contract execution. Retention period: Up to 1 year from the end of the contract or, if not concluded, up to 6 months from the last communication.",
          "• Legal proceedings: Legal basis: Contract execution. Retention period: Up to 6 months after the final judgment.",
          "• Provision of information: Legal basis: Legal obligation. Retention period: For the legal period."
        ]
      },
      {
        heading: "3. Information about consent",
        content: [
          "If the legal basis for the processing of your personal data is consent, the data subject may withdraw it, freely and free of charge, at any time, without any negative consequences. However, withdrawal of consent does not affect the lawfulness of processing carried out based on previously given consents. If consent is withdrawn, REPINDEX will immediately cease processing your personal data for the purpose in question and will proceed to delete it, unless there is a need to process or retain the data for compliance with legal and/or contractual obligations or if there is another legal basis for processing this data, in accordance with applicable legislation.",
          "When data is processed on the basis of legitimate interests or public interest, or when processed for direct marketing purposes, the data subject has the right to object to the processing, which they may do at any time. In this case, REPINDEX will cease processing personal data, unless there are compelling legitimate reasons for continuing such processing that override the interests, rights and freedoms of the data subject, or if the data is necessary for the establishment, exercise or defense of a right in legal proceedings.",
          "If the legal basis for data processing is its necessity for pre-contractual steps or contract execution, if you do not provide us with the requested personal data, this may prevent the conclusion of the contract and/or, where applicable, make it impossible for us to provide you with the requested services."
        ]
      },
      {
        heading: "4. How will my personal data be processed?",
        content: [
          "Your personal data will be processed by REPINDEX, in the context of the indicated purposes, in accordance with this Policy and applicable legislation and using appropriate technical and organizational measures to promote their security and confidentiality, particularly in relation to unauthorized or unlawful processing of your personal data and their accidental loss, destruction or damage. The processing of your data under this Policy will not involve automated individual decision-making."
        ]
      },
      {
        heading: "5. Who are the recipients of my personal data?",
        content: [
          "You may receive additional information about the specific entities to whom your data may be provided, and you can request this information through the contact means referred to in the section of this Policy on the exercise of your rights.",
          "REPINDEX may transfer your personal data outside the European Economic Area, if justified in the context of contract execution or in compliance with a legal obligation, ensuring that these transfers comply with applicable legislation, namely Chapter V of the GDPR, in its currently applicable version. This may be ensured, for example, by ensuring that personal data is only transferred under an adequacy decision of the European Commission or the standard contractual clauses approved by the European Commission (the latter supplemented, if necessary, by additional measures to ensure an adequate level of protection), or by binding corporate rules or any other legally provided means that is adequate for the transfer."
        ]
      },
      {
        heading: "6. What rights do I have over my personal data?",
        content: [
          "As a data subject, whenever applicable, you may exercise the following rights:",
          "• Right of access",
          "• Right to rectification",
          "• Right to erasure",
          "• Right to restriction of processing",
          "• Right to data portability",
          "• Right to object"
        ]
      },
      {
        heading: "7. Cookie information",
        content: [
          "We advise reading the cookie policy available on this website and which forms an integral part of this Policy, to learn more about the processing of your personal data carried out through this functionality."
        ]
      },
      {
        heading: "8. Changes",
        content: [
          "REPINDEX may, at any time, modify this Policy in accordance with new legal or regulatory requirements or update it if justified. We advise regular consultation of this Policy to verify the most updated versions, and REPINDEX will seek to notify you of any relevant changes, namely by placing a notice on the website and/or through the contact means you have provided, where applicable.",
          "For any other questions related to the protection and privacy of personal data, you can contact the REPINDEX Data Protection Officer via email at dpo@repindex.ai."
        ]
      }
    ]
  },
  es: {
    title: "Política de Protección de Datos y Privacidad",
    lastUpdated: "30 de enero de 2026",
    sections: [
      {
        heading: "",
        content: [
          "Reputation Index, Lda. asegura el cumplimiento de las obligaciones derivadas del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y demás legislación sobre protección de datos personales y privacidad."
        ]
      },
      {
        heading: "1. ¿Quién es el responsable del tratamiento de mis datos personales?",
        content: [
          "Reputation Index, Lda., con NIF 519 229 185 (en adelante denominada \"REPINDEX\"), es la responsable del tratamiento de sus datos personales para las finalidades indicadas en la presente Política de Protección de Datos Personales y Privacidad (en adelante, \"Política\")."
        ]
      },
      {
        heading: "2. ¿Para qué finalidad se tratarán mis datos personales?",
        content: [
          "REPINDEX procederá al tratamiento de las siguientes categorías de datos personales para las finalidades que se enuncian a continuación:",
          "• Gestión de sitio web y perfil del usuario: Identificación personal, autenticación, accesos y contacto. Fundamento: Ejecución del contrato cuyos términos se rigen por los T&C de uso del sitio web. Plazo: Hasta 6 meses desde la última visita al sitio web.",
          "• Gestión de clientes y contratos: Identificación personal, autenticación, accesos y contacto. Fundamento: Diligencias precontractuales o ejecución del contrato. Plazo: Hasta 1 año desde el fin del contrato o, si no se ha celebrado, hasta 6 meses desde la última comunicación.",
          "• Proceso judicial: Fundamento: Ejecución del contrato. Plazo: Hasta 6 meses después de la firmeza de la respectiva sentencia.",
          "• Prestación de información: Fundamento: Obligación legal. Plazo: Por el período legal."
        ]
      },
      {
        heading: "3. Información sobre el consentimiento",
        content: [
          "Si el fundamento de licitud para el tratamiento de sus datos personales es el consentimiento, el titular de los datos puede retirarlo, de forma libre y gratuita, en cualquier momento, sin que de ello derive ninguna consecuencia negativa. Sin embargo, la retirada del consentimiento no compromete la licitud de los tratamientos efectuados con base en los consentimientos dados anteriormente. Si se retira el consentimiento, REPINDEX cesará inmediatamente el tratamiento de sus datos personales para la finalidad en cuestión y procederá a su eliminación, salvo si existe necesidad de tratar los datos o de conservarlos para el cumplimiento de obligaciones legales y/o contractuales o si existe otro fundamento de licitud para el tratamiento de estos datos, según la legislación aplicable.",
          "Cuando los datos sean tratados con fundamento en intereses legítimos o interés público, o cuando sean tratados para fines de comercialización directa, el titular de los datos tiene el derecho de oponerse al tratamiento, lo cual podrá hacer en todo momento. En este caso, REPINDEX cesará el tratamiento de los datos personales, excepto si existen razones imperiosas y legítimas para la continuación de dicho tratamiento que prevalezcan sobre los intereses, derechos y libertades del titular, o si los datos son necesarios para efectos de declaración, ejercicio o defensa de un derecho en un proceso judicial.",
          "Si el fundamento de licitud para el tratamiento de los datos es su necesidad para diligencias precontractuales o para la ejecución del contrato, en caso de que no nos facilite los datos personales solicitados, ello podrá impedir la conclusión del contrato y/o, cuando sea aplicable, imposibilitar que le sean proporcionados los servicios solicitados."
        ]
      },
      {
        heading: "4. ¿Cómo se tratarán mis datos personales?",
        content: [
          "Sus datos personales serán tratados por REPINDEX, en el contexto de las finalidades indicadas, de acuerdo con esta Política y la legislación aplicable y con recurso a medidas técnicas y organizativas adecuadas para promover su seguridad y confidencialidad, especialmente en relación con el tratamiento no autorizado o ilícito de sus datos personales y su pérdida, destrucción o daño accidental. Los tratamientos de sus datos al amparo de la presente Política no implicarán la toma de decisiones individuales automatizadas."
        ]
      },
      {
        heading: "5. ¿Quiénes son los destinatarios de mis datos personales?",
        content: [
          "Podrá recibir información adicional sobre las entidades específicas a quienes podrán ser facilitados sus datos, pudiendo solicitar esta información a través de los medios de contacto referidos en el punto de esta Política sobre el ejercicio de sus derechos.",
          "REPINDEX puede transferir sus datos personales fuera del Espacio Económico Europeo, si ello se justifica en el ámbito de la ejecución de un contrato o en cumplimiento de una obligación legal, asegurando que estas transferencias cumplen la legislación aplicable, especialmente el Capítulo V del RGPD, en su redacción actualmente vigente. Esto podrá garantizarse, por ejemplo, asegurando que los datos personales solo se transfieren al amparo de una decisión de adecuación de la Comisión Europea o de las cláusulas contractuales tipo aprobadas por la Comisión Europea (estas últimas complementadas, si es necesario, con medidas suplementarias para garantizar un nivel de protección adecuado), o mediante normas corporativas vinculantes o cualquier otro medio legalmente previsto que sea adecuado para la transferencia."
        ]
      },
      {
        heading: "6. ¿Qué derechos tengo sobre mis datos personales?",
        content: [
          "Como titular de los datos, siempre que sea aplicable, podrá ejercer los siguientes derechos:",
          "• Derecho de acceso",
          "• Derecho de rectificación",
          "• Derecho de supresión",
          "• Derecho a la limitación del tratamiento",
          "• Derecho a la portabilidad de los datos",
          "• Derecho de oposición"
        ]
      },
      {
        heading: "7. Información sobre cookies",
        content: [
          "Aconsejamos la lectura de la política de cookies disponible en este sitio web y que forma parte integrante de la presente Política, para obtener más información sobre el tratamiento de sus datos personales realizado a través de esta funcionalidad."
        ]
      },
      {
        heading: "8. Modificaciones",
        content: [
          "REPINDEX puede, en cualquier momento, modificar la presente Política de conformidad con nuevos requisitos legales o reglamentarios o proceder a su actualización si se justifica. Aconsejamos la consulta regular de esta Política para verificar las versiones más actualizadas, y REPINDEX procurará dar a conocer cualquier cambio relevante, especialmente mediante la colocación de un aviso en el sitio web y/o a través de los medios de contacto que nos haya proporcionado, cuando sea aplicable.",
          "Para cualquier otra cuestión relacionada con la protección y privacidad de los datos personales, puede contactar con el Delegado de Protección de Datos de REPINDEX a través del correo electrónico dpo@repindex.ai."
        ]
      }
    ]
  }
};

// ============================================================================
// FORM LABELS (for GDPR and Complaints forms)
// ============================================================================

export const GDPR_FORM_CONTENT: Record<LegalLanguage, {
  title: string;
  intro: string;
  requestTypes: { value: string; label: string }[];
  fields: Record<string, string>;
  submit: string;
  success: string;
}> = {
  pt: {
    title: "Formulário sobre o Tratamento de Dados Pessoais",
    intro: "Este formulário deve ser utilizado para questões relacionadas com privacidade ou para submeter uma reclamação sobre o tratamento de dados pessoais à Reputation Index, Lda. O formulário será enviado directamente para a Equipa de Privacidade da REPINDEX, e receberá um e-mail automático da nossa parte a confirmar a recepção. Tenha em atenção que este e-mail pode acabar na sua pasta de SPAM. Após a recepção, a nossa Equipa de Privacidade analisará o seu pedido e tomará medidas para atender e/ou responder às suas questões o mais rapidamente possível, de acordo com os requisitos legais. Se necessário, poderemos solicitar informações adicionais para verificar a sua identidade antes de processar o pedido.",
    requestTypes: [
      { value: "update", label: "Actualizar dados" },
      { value: "access", label: "Acesso a dados" },
      { value: "info", label: "Pedido de informações" },
      { value: "delete", label: "Eliminação de dados" },
      { value: "complaint", label: "Apresentar reclamação" },
      { value: "portability", label: "Portabilidade de dados" },
      { value: "restrict", label: "Restringir tratamento" },
      { value: "dpo", label: "Contactar o DPO" },
      { value: "other", label: "Outro" }
    ],
    fields: {
      requestType: "Seleccione tipo(s) de pedido",
      firstName: "Nome próprio",
      lastName: "Apelido",
      email: "Endereço de correio electrónico",
      details: "Detalhes do pedido",
      date: "Data"
    },
    submit: "Enviar Pedido",
    success: "O seu pedido foi enviado com sucesso. Receberá uma confirmação por e-mail."
  },
  en: {
    title: "Personal Data Processing Form",
    intro: "This form should be used for privacy-related questions or to submit a complaint about personal data processing to Reputation Index, Lda. The form will be sent directly to the REPINDEX Privacy Team, and you will receive an automatic email from us confirming receipt. Please note that this email may end up in your SPAM folder. After receipt, our Privacy Team will analyze your request and take action to address and/or respond to your questions as quickly as possible, in accordance with legal requirements. If necessary, we may request additional information to verify your identity before processing the request.",
    requestTypes: [
      { value: "update", label: "Update data" },
      { value: "access", label: "Data access" },
      { value: "info", label: "Information request" },
      { value: "delete", label: "Data deletion" },
      { value: "complaint", label: "Submit complaint" },
      { value: "portability", label: "Data portability" },
      { value: "restrict", label: "Restrict processing" },
      { value: "dpo", label: "Contact the DPO" },
      { value: "other", label: "Other" }
    ],
    fields: {
      requestType: "Select request type(s)",
      firstName: "First name",
      lastName: "Last name",
      email: "Email address",
      details: "Request details",
      date: "Date"
    },
    submit: "Submit Request",
    success: "Your request has been submitted successfully. You will receive an email confirmation."
  },
  es: {
    title: "Formulario sobre el Tratamiento de Datos Personales",
    intro: "Este formulario debe utilizarse para cuestiones relacionadas con la privacidad o para presentar una reclamación sobre el tratamiento de datos personales a Reputation Index, Lda. El formulario se enviará directamente al Equipo de Privacidad de REPINDEX, y recibirá un correo electrónico automático de nuestra parte confirmando la recepción. Tenga en cuenta que este correo electrónico puede acabar en su carpeta de SPAM. Tras la recepción, nuestro Equipo de Privacidad analizará su solicitud y tomará medidas para atender y/o responder a sus cuestiones lo más rápidamente posible, de acuerdo con los requisitos legales. Si es necesario, podremos solicitar información adicional para verificar su identidad antes de procesar la solicitud.",
    requestTypes: [
      { value: "update", label: "Actualizar datos" },
      { value: "access", label: "Acceso a datos" },
      { value: "info", label: "Solicitud de información" },
      { value: "delete", label: "Eliminación de datos" },
      { value: "complaint", label: "Presentar reclamación" },
      { value: "portability", label: "Portabilidad de datos" },
      { value: "restrict", label: "Restringir tratamiento" },
      { value: "dpo", label: "Contactar al DPO" },
      { value: "other", label: "Otro" }
    ],
    fields: {
      requestType: "Seleccione tipo(s) de solicitud",
      firstName: "Nombre",
      lastName: "Apellido",
      email: "Dirección de correo electrónico",
      details: "Detalles de la solicitud",
      date: "Fecha"
    },
    submit: "Enviar Solicitud",
    success: "Su solicitud ha sido enviada con éxito. Recibirá una confirmación por correo electrónico."
  }
};

export const COMPLAINTS_FORM_CONTENT: Record<LegalLanguage, {
  title: string;
  intro: string[];
  process: { step: number; text: string }[];
  fields: Record<string, string>;
  termsLabel: string;
  submit: string;
  success: string;
}> = {
  pt: {
    title: "Formulário para Reclamações",
    intro: [
      "Esforçamo-nos para oferecer um serviço de excelência, pelo que é muito importante para nós garantir a sua satisfação. Reconhecemos que, por vezes, as coisas podem correr mal e encorajamos o envio de feedback pelos nossos utilizadores para nos ajudar a garantir que quaisquer problemas são rapidamente identificados, resolvidos de forma eficaz e que os nossos serviços são melhorados para o futuro.",
      "Não está satisfeito connosco ou tem uma sugestão de melhoria?",
      "Preencha o formulário abaixo com todo o detalhe da reclamação/sugestão e informe-nos.",
      "A sua opinião é importante para nós e ajuda-nos a melhorar o nosso serviço."
    ],
    process: [
      { step: 1, text: "A REPINDEX recebe a sua reclamação, encaminha-a para uma equipa especializada e dedicada, que conduzirá uma análise completa e imparcial." },
      { step: 2, text: "Entraremos em contacto consigo no prazo de 5 dias úteis após a receção da sua reclamação." },
      { step: 3, text: "Se necessitarmos de informações adicionais, entraremos em contacto consigo." },
      { step: 4, text: "O nosso objectivo é resolver a sua reclamação o mais rapidamente possível. Se a análise da reclamação ainda não estiver finalizada, entraremos em contacto consigo para explicar em que fase se encontra o processo e como planeamos prosseguir." }
    ],
    fields: {
      firstName: "Nome próprio",
      lastName: "Apelido",
      email: "E-mail",
      phone: "Telemóvel",
      details: "Detalhes da reclamação"
    },
    termsLabel: "Li e aceito os \"Termos e Condições\"",
    submit: "Enviar Reclamação",
    success: "A sua reclamação foi enviada com sucesso. Entraremos em contacto consigo em breve."
  },
  en: {
    title: "Complaints Form",
    intro: [
      "We strive to offer excellent service, so it is very important for us to ensure your satisfaction. We recognize that sometimes things can go wrong and we encourage our users to send feedback to help us ensure that any problems are quickly identified, effectively resolved and that our services are improved for the future.",
      "Are you dissatisfied with us or have a suggestion for improvement?",
      "Fill out the form below with all the details of your complaint/suggestion and let us know.",
      "Your opinion is important to us and helps us improve our service."
    ],
    process: [
      { step: 1, text: "REPINDEX receives your complaint, forwards it to a specialized and dedicated team, which will conduct a complete and impartial analysis." },
      { step: 2, text: "We will contact you within 5 business days after receiving your complaint." },
      { step: 3, text: "If we need additional information, we will contact you." },
      { step: 4, text: "Our goal is to resolve your complaint as quickly as possible. If the analysis of the complaint is not yet finalized, we will contact you to explain what stage the process is at and how we plan to proceed." }
    ],
    fields: {
      firstName: "First name",
      lastName: "Last name",
      email: "Email",
      phone: "Phone",
      details: "Complaint details"
    },
    termsLabel: "I have read and accept the \"Terms and Conditions\"",
    submit: "Submit Complaint",
    success: "Your complaint has been submitted successfully. We will contact you shortly."
  },
  es: {
    title: "Formulario de Reclamaciones",
    intro: [
      "Nos esforzamos por ofrecer un servicio de excelencia, por lo que es muy importante para nosotros garantizar su satisfacción. Reconocemos que, a veces, las cosas pueden ir mal y animamos a nuestros usuarios a enviar comentarios para ayudarnos a garantizar que cualquier problema se identifique rápidamente, se resuelva eficazmente y que nuestros servicios mejoren para el futuro.",
      "¿No está satisfecho con nosotros o tiene una sugerencia de mejora?",
      "Complete el formulario a continuación con todos los detalles de su reclamación/sugerencia e infórmenos.",
      "Su opinión es importante para nosotros y nos ayuda a mejorar nuestro servicio."
    ],
    process: [
      { step: 1, text: "REPINDEX recibe su reclamación, la remite a un equipo especializado y dedicado, que realizará un análisis completo e imparcial." },
      { step: 2, text: "Nos pondremos en contacto con usted en un plazo de 5 días hábiles tras recibir su reclamación." },
      { step: 3, text: "Si necesitamos información adicional, nos pondremos en contacto con usted." },
      { step: 4, text: "Nuestro objetivo es resolver su reclamación lo más rápidamente posible. Si el análisis de la reclamación aún no ha finalizado, nos pondremos en contacto con usted para explicarle en qué fase se encuentra el proceso y cómo planeamos proceder." }
    ],
    fields: {
      firstName: "Nombre",
      lastName: "Apellido",
      email: "Correo electrónico",
      phone: "Teléfono móvil",
      details: "Detalles de la reclamación"
    },
    termsLabel: "He leído y acepto los \"Términos y Condiciones\"",
    submit: "Enviar Reclamación",
    success: "Su reclamación ha sido enviada con éxito. Nos pondremos en contacto con usted en breve."
  }
};

// ============================================================================
// HELPER: Get language name
// ============================================================================

export const LANGUAGE_NAMES: Record<LegalLanguage, { native: string; flag: string }> = {
  pt: { native: "Português", flag: "🇵🇹" },
  en: { native: "English", flag: "🇬🇧" },
  es: { native: "Español", flag: "🇪🇸" }
};
