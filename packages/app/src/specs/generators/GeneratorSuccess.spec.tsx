import GeneratorSuccess from './GeneratorSuccess.vue'
import { randomComponents } from '@packages/frontend-shared/cypress/support/mock-graphql/testStubSpecs'

const targetSelector = '[data-testid=file-row]'
const spec = randomComponents(1, 'FileParts')[0]
const content = `
import ${spec.baseName} from './${spec.baseName}'
import { mount } from '@cypress/react'

describe('<${spec.baseName} />', () => {
  it('renders', () => {
    // https://docs.cypress.io
    mount(<${spec.baseName} />)
  })
})
`.trim()

describe('<GeneratorSuccess />', () => {
  it('renders the relative file path', () => {
    cy.mount(() => (<GeneratorSuccess file={{ spec, content }} />))
    .get('body')
    .contains(spec.relative)
  })

  it('can be expanded to show the content', () => {
    cy.mount(() => (<GeneratorSuccess file={{ spec, content }} />))
    .get(targetSelector)
    .click()
    .get('code .line')
    .should('have.length', content.split('\n').length)
    .wait(200) // just to show off the animation
    .get(targetSelector)
    .click()
  })

  it('handles really long file names and really long content', () => {
    const relative = 'src/components/deep/nested/path/to/deep/nested/path/to/component/MyComponent/MyComponent.spec.tsx'
    const longContent = Object.keys(Array.from(Array(100))).map((c) => content).join('\n')

    cy.mount(() => (<GeneratorSuccess file={{ spec: { ...spec, relative }, content: longContent }} />))
  })
})