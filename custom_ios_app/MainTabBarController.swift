import UIKit

class MainTabBarController: UITabBarController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupTabs()
        setupAppearance()
    }
    
    private func setupTabs() {
        // Base Port for local HTTP server served by dynamic library
        let basePort = "9898"
        let baseHost = "http://127.0.0.1:\(basePort)"
        
        // 1. Tab 1: Home / Dashboard IDE
        let homeVC = WebViewController(urlString: "\(baseHost)/")
        homeVC.tabBarItem = UITabBarItem(
            title: "Home",
            image: UIImage(systemName: "house"),
            selectedImage: UIImage(systemName: "house.fill")
        )
        
        // 2. Tab 2: Terminal / Console
        let terminalVC = WebViewController(urlString: "\(baseHost)/static/vnc_helper.html")
        terminalVC.tabBarItem = UITabBarItem(
            title: "Terminal",
            image: UIImage(systemName: "terminal"),
            selectedImage: UIImage(systemName: "terminal.fill")
        )
        
        // 3. Tab 3: Code Editor (Monaco Lua Editor)
        let editorVC = WebViewController(urlString: "\(baseHost)/static/editor.html")
        editorVC.tabBarItem = UITabBarItem(
            title: "Editor",
            image: UIImage(systemName: "doc.plaintext"),
            selectedImage: UIImage(systemName: "doc.plaintext.fill")
        )
        
        // 4. Tab 4: Settings
        let settingsVC = WebViewController(urlString: "\(baseHost)/settings")
        settingsVC.tabBarItem = UITabBarItem(
            title: "Settings",
            image: UIImage(systemName: "gearshape"),
            selectedImage: UIImage(systemName: "gearshape.fill")
        )
        
        // Combine tab views
        self.viewControllers = [
            UINavigationController(rootViewController: homeVC),
            UINavigationController(rootViewController: terminalVC),
            UINavigationController(rootViewController: editorVC),
            UINavigationController(rootViewController: settingsVC)
        ].map { vc in
            // Hide navigation bar for WebViews since we have our own header
            vc.isNavigationBarHidden = true
            return vc
        }
    }
    
    private func setupAppearance() {
        // Configure dark theme tab bar to match Web IDE aesthetics
        tabBar.barTintColor = UIColor(red: 30/255, green: 30/255, blue: 46/255, alpha: 1.0) // Dark violet background
        tabBar.tintColor = UIColor(red: 124/255, green: 127/255, blue: 219/255, alpha: 1.0) // Accent violet
        tabBar.unselectedItemTintColor = .lightGray
        
        if #available(iOS 15.0, *) {
            let appearance = UITabBarAppearance()
            appearance.configureWithOpaqueBackground()
            appearance.backgroundColor = UIColor(red: 30/255, green: 30/255, blue: 46/255, alpha: 1.0)
            tabBar.standardAppearance = appearance
            tabBar.scrollEdgeAppearance = appearance
        }
    }
}
