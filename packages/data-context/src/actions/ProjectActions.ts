import type { MutationAddProjectArgs, MutationAppCreateConfigFileArgs, SpecType } from '@packages/graphql/src/gen/nxs.gen'
import type { FindSpecs, FoundBrowser, FoundSpec, FullConfig, LaunchArgs, LaunchOpts, OpenProjectLaunchOptions } from '@packages/types'
import path from 'path'
import type { Maybe, ProjectShape } from '../data/coreDataShape'

import type { DataContext } from '..'

export interface ProjectApiShape {
  getConfig(projectRoot: string): Promise<FullConfig>
  findSpecs(payload: FindSpecs): Promise<FoundSpec[]>
  /**
   * "Initializes" the given mode, since plugins can define the browsers available
   * TODO(tim): figure out what this is actually doing, it seems it's necessary in
   *   order for CT to startup
   */
  initializeProject(args: LaunchArgs, options: OpenProjectLaunchOptions, browsers: FoundBrowser[]): Promise<unknown>
  launchProject(browser: FoundBrowser, spec: Cypress.Spec, options: LaunchOpts): void
  insertProjectToCache(projectRoot: string): void
  removeProjectFromCache(projectRoot: string): void
  getProjectRootsFromCache(): Promise<string[]>
  clearLatestProjectsCache(): Promise<unknown>
}

export class ProjectActions {
  constructor (private ctx: DataContext) {}

  private get api () {
    return this.ctx._apis.projectApi
  }

  clearActiveProject () {
    this.ctx.appData.activeProject = null

    return
  }

  private get projects () {
    return this.ctx.coreData.app.projects
  }

  private set projects (projects: ProjectShape[]) {
    this.ctx.coreData.app.projects = projects
  }

  async setActiveProject (projectRoot: string) {
    this.ctx.coreData.app.activeProject = {
      projectRoot,
      title: '',
      ctPluginsInitialized: false,
      e2ePluginsInitialized: false,
      isFirstTimeCT: await this.ctx.project.isFirstTimeAccessing(projectRoot, 'component'),
      isFirstTimeE2E: await this.ctx.project.isFirstTimeAccessing(projectRoot, 'e2e'),
    }

    return this
  }

  async findSpecs (projectRoot: string, specType: Maybe<SpecType>) {
    const config = await this.ctx.project.getConfig(projectRoot)
    const specs = await this.api.findSpecs({
      projectRoot,
      fixturesFolder: config.fixturesFolder ?? false,
      supportFile: config.supportFile ?? false,
      testFiles: config.testFiles ?? [],
      ignoreTestFiles: config.ignoreTestFiles as string[] ?? [],
      componentFolder: config.projectRoot ?? false,
      integrationFolder: config.integrationFolder ?? '',
    })

    if (!specType) {
      return specs
    }

    return specs.filter((spec) => spec.specType === specType)
  }

  async loadProjects () {
    const projectRoots = await this.api.getProjectRootsFromCache()

    this.projects = [
      ...this.projects,
      ...projectRoots.map((projectRoot) => ({ projectRoot })),
    ]

    return this.projects
  }

  async initializeActiveProject () {
    if (!this.ctx.activeProject?.projectRoot || !this.ctx.wizardData.chosenTestingType) {
      throw Error('Cannot initialize project without an active project')
    }

    if (!this.ctx.wizardData.chosenTestingType) {
      throw Error('Cannot initialize project without choosing testingType')
    }

    const browsers = [...(this.ctx.browserList ?? [])]

    const launchArgs: LaunchArgs = {
      ...this.ctx.launchArgs,
      projectRoot: this.ctx.activeProject.projectRoot,
      testingType: this.ctx.wizardData.chosenTestingType,
    }

    await this.api.initializeProject(launchArgs, this.ctx.launchOptions, browsers)
  }

  createProject () {
    //
  }

  async addProject (args: MutationAddProjectArgs) {
    const projectRoot = await this.getDirectoryPath(args.path)

    const found = this.projects.find((x) => x.projectRoot === projectRoot)

    if (!found) {
      this.projects.push({ projectRoot })
      this.api.insertProjectToCache(projectRoot)
    }

    if (args.open) {
      await this.setActiveProject(projectRoot)
    }
  }

  private async getDirectoryPath (projectRoot: string) {
    try {
      const { dir, base } = path.parse(projectRoot)
      const fullPath = path.join(dir, base)
      const dirStat = await this.ctx.fs.stat(fullPath)

      if (dirStat.isDirectory()) {
        return fullPath
      }

      return dir
    } catch (exception) {
      throw Error(`Cannot add ${projectRoot} to projects as it does not exist in the file system`)
    }
  }

  async launchProject () {
    const browser = this.ctx.wizardData.chosenBrowser ?? this.ctx.appData.browsers?.[0]

    if (!browser) {
      throw Error(`Could not find browser`)
    }

    const spec: Cypress.Spec = {
      name: '',
      absolute: '',
      relative: '',
      specType: this.ctx.wizardData.chosenTestingType === 'e2e' ? 'integration' : 'component',
    }

    return this.api.launchProject(browser, spec, {})
  }

  removeProject (projectRoot: string) {
    const found = this.ctx.projectsList.find((x) => x.projectRoot === projectRoot)

    if (!found) {
      throw new Error(`Cannot remove ${projectRoot}, it is not a known project`)
    }

    this.projects = this.projects.filter((project) => project.projectRoot !== projectRoot)
    this.api.removeProjectFromCache(projectRoot)
  }

  syncProjects () {
    //
  }

  createConfigFile (args: MutationAppCreateConfigFileArgs) {
    const project = this.ctx.activeProject

    if (!project) {
      throw Error(`Cannot create config file without activeProject.`)
    }

    this.ctx.fs.writeFileSync(path.resolve(project.projectRoot, args.configFilename), args.code)
  }

  async clearLatestProjectCache () {
    await this.api.clearLatestProjectsCache()
  }
}