"""Applique les gabarits d'e-mails d'authentification à Supabase.

    python3 scripts/apply-auth-emails.py
    python3 scripts/apply-auth-emails.py --smtp re_xxx "bonjour@archersmarket.fr"

Sans --smtp, seuls les gabarits et les sujets sont posés : ils ne dépendent
pas du serveur d'envoi. Avec --smtp, le SMTP Resend est branché, la limite
d'envoi relevée et la confirmation d'adresse réactivée à l'inscription.

Le jeton d'accès Supabase est lu dans .env.local, jamais versionné. La clé
Resend passe en argument et n'est pas écrite sur le disque.
"""
import json
import subprocess
import sys

PROJECT = "uhflzqexpiyvtcyctqhn"
TOKEN = next(
    line.split("=", 1)[1].strip()
    for line in open(".env.local", encoding="utf-8")
    if line.startswith("SUPABASE_ACCESS_TOKEN=")
)

SITE = "https://archersmarket.fr"
ORANGE = "#F5843C"
DARK = "#1B1B1D"


def shell(title: str, intro: str, action: str, code_note: str) -> str:
    """Un gabarit d'e-mail. Tableaux et styles en ligne : les clients de
    messagerie ne savent rien faire d'autre de façon fiable."""
    return f"""<!doctype html>
<html lang="fr"><body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:{DARK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7">
    <tr><td style="background:{DARK};padding:20px 24px">
      <span style="color:#ffffff;font-size:17px;font-weight:800;letter-spacing:2px">ARCHERS<span style="color:{ORANGE}">MARKET</span></span>
      <div style="color:#9a9aa0;font-size:12px;margin-top:4px">Le marché d'occasion entre archers</div>
    </td></tr>
    <tr><td style="padding:28px 24px 8px">
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:800">{title}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#4b4b50">{intro}</p>
      <p style="margin:0 0 24px">
        <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;background:{ORANGE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">{action}</a>
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#6b6b70">{code_note}</p>
      <p style="margin:0 0 24px;font-size:26px;font-weight:800;letter-spacing:5px;color:{DARK}">{{{{ .Token }}}}</p>
      <p style="margin:0;font-size:12px;line-height:18px;color:#8c8c92">
        Ce lien et ce code expirent dans une heure. Si vous n'êtes pas à l'origine de cette
        demande, ignorez simplement cet e-mail : rien ne se passera.
      </p>
    </td></tr>
    <tr><td style="padding:20px 24px;border-top:1px solid #e4e4e7;font-size:12px;line-height:18px;color:#8c8c92">
      Archers Market · <a href="{SITE}" style="color:#8c8c92">archersmarket.fr</a> ·
      <a href="{SITE}/support.html" style="color:#8c8c92">Aide</a> ·
      <a href="{SITE}/confidentialite.html" style="color:#8c8c92">Confidentialité</a>
    </td></tr>
  </table>
</body></html>"""


payload = {
    "mailer_subjects_confirmation": "Confirmez votre adresse e-mail",
    "mailer_templates_confirmation_content": shell(
        "Bienvenue chez Archers Market",
        "Encore une étape : confirmez votre adresse pour publier vos annonces et échanger "
        "avec les autres archers.",
        "Confirmer mon adresse",
        "Ou saisissez ce code dans l'application :",
    ),
    "mailer_subjects_recovery": "Réinitialiser votre mot de passe",
    "mailer_templates_recovery_content": shell(
        "Nouveau mot de passe",
        "Vous avez demandé à réinitialiser votre mot de passe. Ce lien vous permet d'en "
        "choisir un nouveau.",
        "Choisir un mot de passe",
        "Ou saisissez ce code dans l'application :",
    ),
    "mailer_subjects_magic_link": "Votre lien de connexion",
    "mailer_templates_magic_link_content": shell(
        "Connexion à Archers Market",
        "Voici votre lien de connexion. Il ne fonctionne qu'une seule fois.",
        "Me connecter",
        "Ou saisissez ce code dans l'application :",
    ),
    "mailer_subjects_email_change": "Confirmez votre nouvelle adresse",
    "mailer_templates_email_change_content": shell(
        "Changement d'adresse e-mail",
        "Confirmez cette nouvelle adresse pour qu'elle devienne celle de votre compte "
        "Archers Market.",
        "Confirmer la nouvelle adresse",
        "Ou saisissez ce code dans l'application :",
    ),
}

if len(sys.argv) > 1 and sys.argv[1] == "--smtp":
    api_key, sender = sys.argv[2], sys.argv[3]
    payload.update(
        {
            "smtp_host": "smtp.resend.com",
            "smtp_port": 465,
            "smtp_user": "resend",
            "smtp_pass": api_key,
            "smtp_admin_email": sender,
            "smtp_sender_name": "Archers Market",
            # L'expéditeur de dépannage de Supabase plafonne à deux e-mails par
            # heure — intenable dès la première journée réelle.
            "rate_limit_email_sent": 60,
            # La confirmation d'adresse n'avait de sens qu'une fois l'envoi
            # fiable : sans elle, une faute de frappe enferme le compte.
            "mailer_autoconfirm": False,
        }
    )

result = subprocess.run(
    [
        "curl", "-sS", "--max-time", "60", "-X", "PATCH",
        f"https://api.supabase.com/v1/projects/{PROJECT}/config/auth",
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Content-Type: application/json",
        "-d", json.dumps(payload),
        "-w", "\n[%{http_code}]",
    ],
    capture_output=True,
    text=True,
)
print("gabarits posés" if "[200]" in result.stdout[-12:] else result.stdout[:800])
