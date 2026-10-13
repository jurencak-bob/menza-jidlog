#!/usr/bin/env python3
"""Sdílené UI + logování pro Python skripty (univerzální, bez domény).

Co poskytuje:
  - smazání obrazovky + zelený orámovaný nadpis,
  - potvrzení „Pokračovat? [A/N]" (A i skrytě Y),
  - barevné zvýraznění nálezů (žlutě), úspěchu (zeleně), chyb (červeně),
  - log každého běhu do log/<jmeno_skriptu>.log, nejnovější běh NAHOŘE,
    do logu jdou jen nezbytné údaje (řádky označené log=True),
  - závěrečný dotaz „Zobrazit log? [A/N]",
  - společný argparse parser (make_parser) s --yes/--no-input/--help,
    volitelně --write (mutující skripty) a --sample.

CRON / neinteraktivní běh:
  Když výstup (nebo vstup) není terminál — typicky spuštění z cronu — skript
  se NEPTÁ na potvrzení ani nenabízí zobrazení logu, jen proběhne a zaloguje.
  Interaktivitu lze vynuceně vypnout i na terminálu přes --yes / -y / --no-input.

Umístění: tenhle modul patří do složky script_python/ vedle skriptů, které ho importují.
"""
import sys
import os
import re
import atexit
import argparse
from datetime import datetime


def make_parser(description, write=False, sample=False):
    """Společný parser. Vždy --yes/-y, --no-input a --help.
    write=True přidá --write (jinak je skript jen náhledový/čtecí),
    sample=True přidá --sample N (rychlý test)."""
    p = argparse.ArgumentParser(
        description=description,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    if write:
        p.add_argument("--write", action="store_true",
                       help="Provést změny. Bez tohoto přepínače jen náhled (dry-run).")
    p.add_argument("--yes", "-y", action="store_true",
                   help="Přeskočit potvrzení „Pokračovat?\" (vhodné do cronu).")
    p.add_argument("--no-input", action="store_true",
                   help="Neinteraktivní běh: bez potvrzení a bez nabídky zobrazení logu.")
    if sample:
        p.add_argument("--sample", type=int, default=0,
                       help="Zpracovat jen N položek (rychlý test).")
    return p


_TTY = sys.stdout.isatty()
_ANSI = re.compile(r"\033\[[0-9;]*m")


def _noninteractive_flag():
    return any(a in sys.argv for a in ("--yes", "-y", "--no-input"))


def is_interactive():
    """True jen když má smysl ptát se uživatele (terminál a bez --yes/--no-input)."""
    if _noninteractive_flag():
        return False
    return sys.stdin.isatty() and sys.stdout.isatty()


def c(text, code):
    return f"\033[{code}m{text}\033[0m" if _TTY else text


def bold_yellow(t):
    return c(t, "1;33")   # nález / počet změn


def green(t):
    return c(t, "32")     # úspěch


def red(t):
    return c(t, "1;31")   # chyba


class Console:
    """Drží log buffer a řídí výstup jednoho běhu skriptu."""

    def __init__(self, script_file, title, is_write=False):
        base = os.path.dirname(os.path.abspath(script_file))
        name = os.path.splitext(os.path.basename(script_file))[0]
        self.log_dir = os.path.join(base, "log")
        self.log_file = os.path.join(self.log_dir, name + ".log")
        self.title = title
        self.is_write = is_write
        self._buf = []
        self._flushed = False
        atexit.register(self._flush)

    # --- výstup ---
    def out(self, text="", end="\n", log=False):
        """Vypíše na terminál; s log=True uloží (bez ANSI barev) i do logu.
        Do logu patří jen nezbytné údaje — ne ozdoby a průběh."""
        print(text, end=end, flush=True)
        if log:
            self._buf.append(_ANSI.sub("", text) + end)

    # --- úvod + potvrzení ---
    def start(self):
        """Smaže obrazovku, vypíše rámeček a (interaktivně) se zeptá na pokračování.
        V neinteraktivním režimu (cron) rovnou pokračuje."""
        if _TTY:
            print("\033[2J\033[H", end="")  # smazat obrazovku, kurzor nahoru
        inner = f"  {self.title}  "
        line = "─" * len(inner)
        self.out(green(f"┌{line}┐"))
        self.out(green(f"│{inner}│"))
        self.out(green(f"└{line}┘"))
        rezim = "ZÁPIS (--write)" if self.is_write else "jen náhled (dry-run)"
        self.out(f"Režim: {bold_yellow(rezim) if self.is_write else rezim}")
        if not is_interactive():
            return  # cron / --yes: bez ptaní jedeme dál
        try:
            odp = input(green("Pokračovat? [A/N] ")).strip().lower()
        except (EOFError, KeyboardInterrupt):
            odp = "n"
        if odp not in ("a", "y"):
            self.out("Přerušeno uživatelem.")
            sys.exit(0)

    # --- závěr: nabídnout log ---
    def offer_log(self):
        """Interaktivně se zeptá, jestli vypsat log. V cronu nedělá nic."""
        if not is_interactive():
            return
        try:
            odp = input(green("\nZobrazit log? [A/N] ")).strip().lower()
        except (EOFError, KeyboardInterrupt):
            odp = "n"
        if odp in ("a", "y"):
            self._flush()  # zapsat aktuální běh ještě před zobrazením
            if os.path.exists(self.log_file):
                with open(self.log_file, encoding="utf-8") as f:
                    print("\n" + f.read())

    # --- zápis logu (nejnovější běh nahoře) ---
    def _flush(self):
        if self._flushed or not self._buf:
            return
        self._flushed = True
        os.makedirs(self.log_dir, exist_ok=True)
        rezim_txt = "ZÁPIS (--write)" if self.is_write else "dry-run"
        head = "=" * 72 + f"\n {datetime.now():%Y-%m-%d %H:%M:%S}  |  {rezim_txt}\n" + "=" * 72 + "\n"
        blok = head + "".join(self._buf).rstrip("\n") + "\n\n"
        stare = ""
        if os.path.exists(self.log_file):
            with open(self.log_file, encoding="utf-8") as f:
                stare = f.read()
        with open(self.log_file, "w", encoding="utf-8") as f:
            f.write(blok + stare)  # nový běh na začátek souboru
