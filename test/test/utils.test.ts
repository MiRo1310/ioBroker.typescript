import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isDefined } from '../../src/lib/utils.ts';

describe('utils.ts', () => {
    describe('isDefined', () => {
        it('returns false for undefined and null', () => {
            expect(isDefined(undefined)).to.be.false;
            expect(isDefined(null)).to.be.false;
        });

        it('returns true for falsy but defined values', () => {
            expect(isDefined(0)).to.be.true;
            expect(isDefined('')).to.be.true;
            expect(isDefined(false)).to.be.true;
        });
    });
});
