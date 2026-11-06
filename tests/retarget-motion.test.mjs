import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicatorFrame, nextTabKey, retarget } from '../src/retarget-motion.mjs';

function fakeNode(computed = {}) {
  const animations = [];
  return {
    animations,
    style: {},
    ownerDocument: { defaultView: { getComputedStyle: () => computed } },
    getAnimations() { return animations.slice(); },
    animate(frames) {
      const animation = {
        frames,
        cancel() {
          const index = animations.indexOf(animation);
          if (index >= 0) animations.splice(index, 1);
        },
      };
      animations.push(animation);
      return animation;
    },
  };
}

test('the chart indicator uses the tab offset inside the list, not the list offset in its parent', () => {
  const list = { offsetLeft: 120, offsetTop: 80 };
  const tab = { offsetLeft: 16, offsetTop: 0, offsetHeight: 44, offsetWidth: 90, offsetParent: list };
  const frame = indicatorFrame(tab, list);
  assert.equal(frame.transform, 'translate3d(16px, 42px, 0)');
  assert.equal(frame.width, '90px');
  const wrapped = { offsetLeft: 4, offsetTop: 48, offsetHeight: 36, offsetWidth: 70, offsetParent: list };
  assert.equal(indicatorFrame(wrapped, list).transform, 'translate3d(4px, 82px, 0)');
});

test('a tab whose offset parent sits inside the list still excludes the list parent offset', () => {
  const list = { offsetLeft: 200, offsetTop: 90 };
  const mid = { offsetLeft: 12, offsetTop: 8, offsetParent: list };
  const tab = { offsetLeft: 6, offsetTop: 2, offsetHeight: 20, offsetWidth: 40, offsetParent: mid };
  const frame = indicatorFrame(tab, list);
  assert.equal(frame.transform, 'translate3d(18px, 28px, 0)');
  assert.equal(frame.width, '40px');
});

test('arrow keys select the next chart tab immediately, including wrap', () => {
  const keys = ['timeline', 'trend'];
  assert.equal(nextTabKey(keys, 'timeline', 'ArrowRight'), 'trend');
  assert.equal(nextTabKey(keys, 'trend', 'ArrowRight'), 'timeline');
  assert.equal(nextTabKey(keys, 'trend', 'ArrowLeft'), 'timeline');
  assert.equal(nextTabKey(keys, 'timeline', 'Home'), 'timeline');
  assert.equal(nextTabKey(keys, 'timeline', 'End'), 'trend');
  assert.equal(nextTabKey(keys, 'timeline', 'Enter'), null);
});

test('motion keeps the latest end state and skips the first paint and reduced motion', () => {
  const node = fakeNode({ opacity: '0.8' });
  assert.equal(retarget(node, [{ opacity: '0.72' }, { opacity: '1' }], { first: true }), 'still');
  assert.equal(node.style.opacity, '1');
  assert.equal(node.animations.length, 0);

  assert.equal(retarget(node, [{ opacity: '0.72' }, { opacity: '1' }]), 'played');
  assert.equal(node.animations.length, 1);
  assert.equal(node.animations[0].frames[0].opacity, '0.72');

  assert.equal(retarget(node, [{ opacity: '0.2' }, { opacity: '1' }]), 'played');
  assert.equal(node.animations.length, 1);
  assert.equal(node.animations[0].frames[0].opacity, '0.8');
  assert.equal(node.animations[0].frames[1].opacity, '1');

  assert.equal(retarget(node, [{ opacity: '1' }], { reduce: true }), 'still');
  assert.equal(node.animations.length, 0);
  assert.equal(node.style.opacity, '1');
});
