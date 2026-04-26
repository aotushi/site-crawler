import { MaterialIcon } from './MaterialIcon'

export function HomeIntegrations() {
  return (
    <section className="py-16 px-6 border-y border-outline-variant bg-white">
      <div className="max-w-[1200px] mx-auto">
        <p className="text-center font-semibold text-secondary mb-12 uppercase tracking-widest text-xs">Seamlessly Supporting All Web Tech</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
          <div className="flex flex-col items-center gap-2">
            <MaterialIcon name="html" className="text-4xl" />
            <span className="font-semibold text-sm">HTML5</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <MaterialIcon name="css" className="text-4xl" />
            <span className="font-semibold text-sm">CSS3</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <MaterialIcon name="javascript" className="text-4xl" />
            <span className="font-semibold text-sm">JS ES6+</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <MaterialIcon name="image" className="text-4xl" />
            <span className="font-semibold text-sm">Optimized Assets</span>
          </div>
        </div>
      </div>
    </section>
  )
}
