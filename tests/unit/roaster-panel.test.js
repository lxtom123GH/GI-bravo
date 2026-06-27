import { describe, it, expect } from 'vitest';
import { BEHMOR_BUTTONS, buttonHelp, behmorPanel, BEHMOR_MODELS } from '../../js/roaster-panel.js';

describe('Behmor button reference', () => {
    it('covers the key controls with both phases', () => {
        const ids = BEHMOR_BUTTONS.map(b => b.id);
        ['weight', 'profile', 'start', 'A', 'B', 'C', 'D', 'cool'].forEach(id => expect(ids).toContain(id));
        BEHMOR_BUTTONS.forEach(b => { expect(b.setup).toBeTruthy(); expect(b.live).toBeTruthy(); });
    });
    it('buttonHelp returns phase-specific text', () => {
        expect(buttonHelp('C', 'live')).toMatch(/time/i);
        expect(buttonHelp('A', 'live')).toMatch(/exhaust/i);
        expect(buttonHelp('nope', 'live')).toBe('');
    });
});

describe('behmorPanel — model variants', () => {
    it('2000AB Plus: audible beep safety + 16/32 rpm drum', () => {
        const p = behmorPanel('2000AB Plus');
        expect(p.safety).toMatch(/beep/i);
        expect(p.buttons.find(b => b.id === 'D').live).toMatch(/16 . 32/);
        expect(p.uncertain).toBe(false);
    });
    it('2000AB: lights blink, explicitly no beep', () => {
        const s = behmorPanel('2000AB').safety;
        expect(s).toMatch(/blink/i);
        expect(s).toMatch(/no beep/i);
        expect(s).not.toMatch(/audible beep/i);
    });
    it('1600 Plus: no A/B temperature readout + 8/16 rpm', () => {
        const p = behmorPanel('1600 Plus');
        expect(p.buttons.find(b => b.id === 'A').live).toMatch(/no temperature/i);
        expect(p.buttons.find(b => b.id === 'D').live).toMatch(/8 . 16/);
    });
    it('unknown model → uncertain + generic safety', () => {
        const p = behmorPanel('Other / not sure');
        expect(p.uncertain).toBe(true);
        expect(p.safety).toMatch(/manual/i);
    });
    it('exposes a model list including the common Behmors', () => {
        expect(BEHMOR_MODELS).toContain('2000AB Plus');
        expect(BEHMOR_MODELS).toContain('1600 Plus');
    });
});
